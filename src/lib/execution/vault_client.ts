import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
  SystemProgram,
  ComputeBudgetProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  getMint,
} from '@solana/spl-token';
import { BN, BorshAccountsCoder, BorshInstructionCoder, Idl } from '@coral-xyz/anchor';
import { BasketDefinition, BasketMintQuote, BasketRedeemQuote } from '../types';
import { SYNTHABASKET_IDL } from './idl';
import { getDevnetMirrorMint } from './devnet_mirrors';

export const SYNTHABASKET_PROGRAM_ID = new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID || '4BLhUEXXqBBuciecSaVEo41NrXeDGGNhNLdfLmoeqstA');

export interface BasketExecutionSnapshot {
  executionSymbol: string;
  basketPda: string;
  basketMint: string;
  totalSharesMinted: number;
  reserves: Array<{
    symbol: string;
    mint: string;
    rawAmount: string;
    uiAmount: number;
    decimals: number;
  }>;
}

export class SynthaBasketVaultClient {
  private connection: Connection;
  private programId: PublicKey;
  private instructionCoder: BorshInstructionCoder;
  private accountsCoder: BorshAccountsCoder;

  constructor(connection: Connection, programId: PublicKey = SYNTHABASKET_PROGRAM_ID) {
    this.connection = connection;
    this.programId = programId;
    const idl = SYNTHABASKET_IDL as unknown as Idl;
    this.instructionCoder = new BorshInstructionCoder(idl);
    this.accountsCoder = new BorshAccountsCoder(idl);
  }

  private getExecutionSymbol(
    basket: BasketDefinition,
    useDevnetMirrors: boolean
  ): string {
    return useDevnetMirrors
      ? basket.devnetExecutionSymbol || `${basket.symbol}D`
      : basket.symbol;
  }

  getBasketPda(symbol: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('basket'), Buffer.from(symbol.toUpperCase())],
      this.programId
    );
  }

  getBasketMintPda(symbol: string): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('basket_mint'), Buffer.from(symbol.toUpperCase())],
      this.programId
    );
  }

  getVaultTokenAccount(basketPda: PublicKey, tokenMint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(tokenMint, basketPda, true);
  }

  getUserTokenAccount(userPublicKey: PublicKey, tokenMint: PublicKey): PublicKey {
    return getAssociatedTokenAddressSync(tokenMint, userPublicKey);
  }

  /**
   * Reads SPL token mint decimals dynamically from the cluster with cached fallbacks.
   */
  async getMintDecimals(mintPubkey: PublicKey): Promise<number> {
    try {
      const mintInfo = await getMint(this.connection, mintPubkey);
      return mintInfo.decimals;
    } catch {
      // Default to 6 decimals if offline or uninitialized
      return 6;
    }
  }

  async buildInitializeBasketTransaction(
    authority: PublicKey,
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false,
    protocolFeeBps: number = 25
  ): Promise<Transaction> {
    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);

    const constituentMints = basket.constituents.map((constituent) => {
      const mint = useDevnetMirrors
        ? constituent.asset.devnetMint || getDevnetMirrorMint(constituent.asset.symbol)
        : constituent.asset.tokenMint;
      if (!mint) {
        throw new Error(
          `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${constituent.asset.symbol}.`
        );
      }
      return new PublicKey(mint);
    });

    const encodedData = this.instructionCoder.encode('initializeBasket', {
      symbol: executionSymbol,
      name: basket.name.slice(0, 32),
      constituents: constituentMints,
      weightsBps: basket.constituents.map((constituent) => constituent.targetWeightBps),
      protocolFeeBps,
    });

    const tx = new Transaction().add(
      new TransactionInstruction({
        programId: this.programId,
        keys: [
          { pubkey: authority, isSigner: true, isWritable: true },
          { pubkey: basketPda, isSigner: false, isWritable: true },
          { pubkey: basketMint, isSigner: false, isWritable: true },
          { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
          { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
          { pubkey: SYSVAR_RENT_PUBKEY, isSigner: false, isWritable: false },
        ],
        data: encodedData,
      })
    );

    const latest = await this.connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = latest.blockhash;
    tx.feePayer = authority;
    return tx;
  }

  /**
   * Verifies the live on-chain basket state before a user is asked to deposit.
   * This prevents the UI from treating a derived PDA or stale registry entry as custody proof.
   */
  async verifyBasketExecutionState(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<void> {
    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);

    if (!useDevnetMirrors) {
      if (basketPda.toBase58() !== basket.vaultPda) {
        throw new Error(`Registry vault PDA mismatch for ${basket.symbol}.`);
      }
      if (basketMint.toBase58() !== basket.basketMint) {
        throw new Error(`Registry basket mint mismatch for ${basket.symbol}.`);
      }
    }

    const basketInfo = await this.connection.getAccountInfo(basketPda, 'confirmed');
    if (!basketInfo) {
      throw new Error(`Basket vault ${basket.symbol} (${executionSymbol}) is not initialized on the connected cluster.`);
    }
    if (!basketInfo.owner.equals(this.programId)) {
      throw new Error(`Basket vault ${basket.symbol} (${executionSymbol}) is not owned by the SynthaBasket program.`);
    }

    const mintInfo = await this.connection.getAccountInfo(basketMint, 'confirmed');
    if (!mintInfo || !mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      throw new Error(`Basket mint ${basket.symbol} is not initialized as an SPL mint on this cluster.`);
    }

    let decoded: any;
    try {
      decoded = this.accountsCoder.decode('BasketState', basketInfo.data);
    } catch {
      throw new Error(`Unable to decode live basket state for ${basket.symbol}; IDL/program version mismatch.`);
    }

    const onChainBasketMint = new PublicKey(decoded.basketMint).toBase58();
    if (onChainBasketMint !== basketMint.toBase58()) {
      throw new Error(`On-chain basket mint does not match the registry for ${basket.symbol}.`);
    }

    const expectedConstituents = basket.constituents.map((constituent) => {
      const mint = useDevnetMirrors
        ? constituent.asset.devnetMint || getDevnetMirrorMint(constituent.asset.symbol)
        : constituent.asset.tokenMint;
      if (!mint) {
        throw new Error(`No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${constituent.asset.symbol}.`);
      }
      return new PublicKey(mint).toBase58();
    });

    const onChainConstituents = (decoded.constituents as PublicKey[]).map((mint) =>
      new PublicKey(mint).toBase58()
    );

    if (
      onChainConstituents.length !== expectedConstituents.length ||
      onChainConstituents.some((mint, index) => mint !== expectedConstituents[index])
    ) {
      throw new Error(
        `On-chain constituent configuration for ${basket.symbol} does not match the active execution mints.`
      );
    }
  }


  /**
   * Hydrates the execution basket from live Solana state.
   *
   * Supply is read from the SPL basket mint and reserve balances are read from
   * the vault's actual token accounts. Registry AUM/share counts are never
   * substituted when this method succeeds.
   */
  async getBasketExecutionSnapshot(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<BasketExecutionSnapshot> {
    await this.verifyBasketExecutionState(basket, useDevnetMirrors);

    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);

    const basketMintInfo = await getMint(this.connection, basketMint, 'confirmed');
    const totalSharesMinted =
      Number(basketMintInfo.supply) / 10 ** basketMintInfo.decimals;

    const reserves = await Promise.all(
      basket.constituents.map(async (constituent) => {
        const executionMint = useDevnetMirrors
          ? constituent.asset.devnetMint || getDevnetMirrorMint(constituent.asset.symbol)
          : constituent.asset.tokenMint;

        if (!executionMint) {
          throw new Error(
            `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${constituent.asset.symbol}.`
          );
        }

        const mint = new PublicKey(executionMint);
        const decimals = await this.getMintDecimals(mint);
        const vaultAta = this.getVaultTokenAccount(basketPda, mint);
        const balance = await this.connection
          .getTokenAccountBalance(vaultAta, 'confirmed')
          .catch(() => null);

        const rawAmount = balance?.value.amount || '0';

        return {
          symbol: constituent.asset.symbol,
          mint: mint.toBase58(),
          rawAmount,
          uiAmount: Number(rawAmount) / 10 ** decimals,
          decimals,
        };
      })
    );

    return {
      executionSymbol,
      basketPda: basketPda.toBase58(),
      basketMint: basketMint.toBase58(),
      totalSharesMinted,
      reserves,
    };
  }

  /**
   * Returns true when the connected wallet already holds enough of every
   * execution constituent for this quote. On Devnet this lets a failed
   * post-acquisition attempt resume without charging USDC a second time.
   */
  async hasSufficientDepositBalances(
    userPublicKey: PublicKey,
    basket: BasketDefinition,
    quote: BasketMintQuote,
    useDevnetMirrors: boolean = false
  ): Promise<boolean> {
    for (const allocation of quote.allocations) {
      const executionMint = useDevnetMirrors
        ? allocation.asset.devnetMint || getDevnetMirrorMint(allocation.asset.symbol)
        : allocation.asset.tokenMint;
      if (!executionMint) return false;

      const mint = new PublicKey(executionMint);
      const userAta = this.getUserTokenAccount(userPublicKey, mint);
      const account = await this.connection
        .getTokenAccountBalance(userAta, 'confirmed')
        .catch(() => null);
      if (!account) return false;

      const requiredRaw = allocation.rawTokenAmount
        ? BigInt(allocation.rawTokenAmount)
        : BigInt(
            Math.floor(
              allocation.estimatedTokensReceived *
                10 ** (await this.getMintDecimals(mint))
            )
          );

      if (BigInt(account.value.amount) < requiredRaw) return false;
    }

    return true;
  }

  /**
   * Converts an acquisition quote into the largest non-dilutive deposit that
   * the live vault can accept. For existing baskets we derive mintable shares
   * from current reserves, then trim each constituent deposit to the exact
   * proportional amount needed. Any tiny rounding surplus stays in the user's
   * wallet instead of being donated to the vault.
   */
  async prepareProportionalMintQuote(
    basket: BasketDefinition,
    quote: BasketMintQuote,
    useDevnetMirrors: boolean = false
  ): Promise<BasketMintQuote> {
    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const basketInfo = await this.connection.getAccountInfo(basketPda, 'confirmed');

    if (!basketInfo) {
      throw new Error(
        `Basket vault ${basket.symbol} (${executionSymbol}) is not initialized on the connected cluster.`
      );
    }

    const decoded: any = this.accountsCoder.decode('BasketState', basketInfo.data);
    const totalShares = BigInt(decoded.totalSharesMinted.toString());

    // First issuance establishes reserves, so the quoted basket amount can be
    // used directly as long as every constituent amount is positive.
    if (totalShares === 0n) return quote;

    const reserves = (decoded.vaultReserves as any[]).map((value) =>
      BigInt(value.toString())
    );

    if (reserves.length !== quote.allocations.length) {
      throw new Error('Live vault reserve count does not match the basket quote.');
    }

    const basketDecimals = 6;
    const quotedSharesRaw = BigInt(
      Math.floor(quote.expectedBasketTokens * 10 ** basketDecimals)
    );
    if (quotedSharesRaw <= 0n) {
      throw new Error('Quoted basket share amount is zero.');
    }

    let safeSharesRaw = quotedSharesRaw;
    const acquiredRaw: bigint[] = [];

    for (let i = 0; i < quote.allocations.length; i += 1) {
      const allocation = quote.allocations[i];
      const executionMint = useDevnetMirrors
        ? allocation.asset.devnetMint || getDevnetMirrorMint(allocation.asset.symbol)
        : allocation.asset.tokenMint;

      if (!executionMint) {
        throw new Error(
          `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${allocation.asset.symbol}.`
        );
      }

      const mint = new PublicKey(executionMint);
      const rawAmount = allocation.rawTokenAmount
        ? BigInt(allocation.rawTokenAmount)
        : BigInt(
            Math.floor(
              allocation.estimatedTokensReceived *
                10 ** (await this.getMintDecimals(mint))
            )
          );

      const reserve = reserves[i];
      if (reserve <= 0n || rawAmount <= 0n) {
        throw new Error(
          `Cannot prepare proportional deposit for ${allocation.asset.symbol}: reserve or acquired amount is zero.`
        );
      }

      acquiredRaw.push(rawAmount);
      const mintableFromLeg = (rawAmount * totalShares) / reserve;
      if (mintableFromLeg < safeSharesRaw) safeSharesRaw = mintableFromLeg;
    }

    if (safeSharesRaw <= 0n) {
      throw new Error('Acquired constituent amounts cannot mint any basket shares.');
    }

    const allocations = [];
    for (let i = 0; i < quote.allocations.length; i += 1) {
      const allocation = quote.allocations[i];
      const reserve = reserves[i];

      // ceil(safeShares * reserve / totalShares) so the contract's floor-based
      // proportional-share calculation is guaranteed to accept the target.
      const requiredRaw =
        (safeSharesRaw * reserve + totalShares - 1n) / totalShares;

      if (requiredRaw > acquiredRaw[i]) {
        throw new Error(
          `Proportional deposit requires more ${allocation.asset.symbol} than was acquired.`
        );
      }

      const executionMint = useDevnetMirrors
        ? allocation.asset.devnetMint || getDevnetMirrorMint(allocation.asset.symbol)
        : allocation.asset.tokenMint;
      const decimals = await this.getMintDecimals(new PublicKey(executionMint!));

      allocations.push({
        ...allocation,
        rawTokenAmount: requiredRaw.toString(),
        estimatedTokensReceived: Number(requiredRaw) / 10 ** decimals,
      });
    }

    return {
      ...quote,
      expectedBasketTokens: Number(safeSharesRaw) / 10 ** basketDecimals,
      allocations,
    };
  }

  /**
   * Confirms the user actually holds every constituent amount that will be
   * transferred by deposit_and_mint. This runs after acquisition confirmation
   * and before asking the wallet to sign the vault deposit.
   */
  async verifyDepositBalances(
    userPublicKey: PublicKey,
    basket: BasketDefinition,
    quote: BasketMintQuote,
    useDevnetMirrors: boolean = false
  ): Promise<void> {
    for (const allocation of quote.allocations) {
      const executionMint = useDevnetMirrors
        ? allocation.asset.devnetMint || getDevnetMirrorMint(allocation.asset.symbol)
        : allocation.asset.tokenMint;

      if (!executionMint) {
        throw new Error(
          `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${allocation.asset.symbol}.`
        );
      }

      const mint = new PublicKey(executionMint);
      const userAta = this.getUserTokenAccount(userPublicKey, mint);
      const account = await this.connection.getTokenAccountBalance(userAta, 'confirmed').catch(() => null);

      if (!account) {
        throw new Error(
          `Acquisition did not create a usable ${allocation.asset.symbol} token account for the connected wallet.`
        );
      }

      const requiredRaw = allocation.rawTokenAmount
        ? BigInt(allocation.rawTokenAmount)
        : BigInt(
            Math.floor(
              allocation.estimatedTokensReceived * 10 ** (await this.getMintDecimals(mint))
            )
          );

      const availableRaw = BigInt(account.value.amount);
      if (availableRaw < requiredRaw) {
        throw new Error(
          `Insufficient confirmed ${allocation.asset.symbol} balance after acquisition: need ${requiredRaw.toString()} raw units, found ${availableRaw.toString()}.`
        );
      }
    }
  }

  /**
   * Builds an executable transaction for depositing constituent tokens and minting basket shares.
   * Encodes instruction data directly using Anchor's BorshInstructionCoder from IDL.
   */
  async buildMintTransaction(
    userPublicKey: PublicKey,
    basket: BasketDefinition,
    quote: BasketMintQuote,
    priorityFeeMicroLamports: number = 50_000,
    useDevnetMirrors: boolean = false
  ): Promise<Transaction> {
    const tx = new Transaction();

    // 1. Add Compute Budget Instructions
    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));

    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);
    const userBasketAta = this.getUserTokenAccount(userPublicKey, basketMint);

    // 2. Ensure User's Basket Token ATA exists
    tx.add(
      createAssociatedTokenAccountIdempotentInstruction(
        userPublicKey,
        userBasketAta,
        userPublicKey,
        basketMint
      )
    );

    // 3. Assemble remaining accounts & dynamic decimal conversion
    const remainingAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [];
    const constituentAmountsIn: BN[] = [];

    for (const alloc of quote.allocations) {
      const executionMint = useDevnetMirrors
        ? alloc.asset.devnetMint || getDevnetMirrorMint(alloc.asset.symbol)
        : alloc.asset.tokenMint;
      if (!executionMint) {
        throw new Error(`No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${alloc.asset.symbol}.`);
      }
      const mintPubkey = new PublicKey(executionMint);
      const userAta = this.getUserTokenAccount(userPublicKey, mintPubkey);
      const vaultAta = this.getVaultTokenAccount(basketPda, mintPubkey);

      // Ensure Vault ATA exists
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          userPublicKey,
          vaultAta,
          basketPda,
          mintPubkey
        )
      );

      remainingAccounts.push(
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: vaultAta, isSigner: false, isWritable: true }
      );

      // Dynamic decimals lookup
      const rawAmount = alloc.rawTokenAmount
        ? BigInt(alloc.rawTokenAmount)
        : BigInt(
            Math.floor(
              alloc.estimatedTokensReceived * 10 ** (await this.getMintDecimals(mintPubkey))
            )
          );
      constituentAmountsIn.push(new BN(rawAmount.toString()));
    }

    // 4. Encode instruction using Anchor IDL BorshInstructionCoder
    const basketDecimals = 6;
    const sharesToMintRaw = BigInt(Math.floor(quote.expectedBasketTokens * 10 ** basketDecimals));
    const encodedData = this.instructionCoder.encode('depositAndMint', {
      sharesToMint: new BN(sharesToMintRaw.toString()),
      constituentAmountsIn,
    });

    const depositInstruction = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: basketPda, isSigner: false, isWritable: true },
        { pubkey: basketMint, isSigner: false, isWritable: true },
        { pubkey: userBasketAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        ...remainingAccounts,
      ],
      data: encodedData,
    });

    tx.add(depositInstruction);
    try {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
    } catch {
      tx.recentBlockhash = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    }
    tx.feePayer = userPublicKey;

    return tx;
  }

  /**
   * Builds an executable transaction for burning basket shares and redeeming underlying tokens.
   * Encodes instruction data directly using Anchor's BorshInstructionCoder from IDL.
   */
  async buildRedeemTransaction(
    userPublicKey: PublicKey,
    basket: BasketDefinition,
    quote: BasketRedeemQuote,
    priorityFeeMicroLamports: number = 50_000,
    useDevnetMirrors: boolean = false
  ): Promise<Transaction> {
    const tx = new Transaction();

    tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
    tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports }));

    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);
    const userBasketAta = this.getUserTokenAccount(userPublicKey, basketMint);

    const remainingAccounts: Array<{ pubkey: PublicKey; isSigner: boolean; isWritable: boolean }> = [];

    for (const item of quote.constituentsToReturn) {
      const executionMint = useDevnetMirrors
        ? item.asset.devnetMint || getDevnetMirrorMint(item.asset.symbol)
        : item.asset.tokenMint;
      if (!executionMint) {
        throw new Error(`No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${item.asset.symbol}.`);
      }
      const mintPubkey = new PublicKey(executionMint);
      const userAta = this.getUserTokenAccount(userPublicKey, mintPubkey);
      const vaultAta = this.getVaultTokenAccount(basketPda, mintPubkey);

      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          userPublicKey,
          userAta,
          userPublicKey,
          mintPubkey
        )
      );

      remainingAccounts.push(
        { pubkey: vaultAta, isSigner: false, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true }
      );
    }

    const basketDecimals = 6;
    const sharesToBurnRaw = BigInt(Math.floor(quote.burnBasketTokensAmount * 10 ** basketDecimals));
    const encodedData = this.instructionCoder.encode('burnAndRedeem', {
      sharesToBurn: new BN(sharesToBurnRaw.toString()),
    });

    const redeemInstruction = new TransactionInstruction({
      programId: this.programId,
      keys: [
        { pubkey: userPublicKey, isSigner: true, isWritable: true },
        { pubkey: basketPda, isSigner: false, isWritable: true },
        { pubkey: basketMint, isSigner: false, isWritable: true },
        { pubkey: userBasketAta, isSigner: false, isWritable: true },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        ...remainingAccounts,
      ],
      data: encodedData,
    });

    tx.add(redeemInstruction);
    try {
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      tx.recentBlockhash = blockhash;
    } catch {
      tx.recentBlockhash = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';
    }
    tx.feePayer = userPublicKey;

    return tx;
  }
}
