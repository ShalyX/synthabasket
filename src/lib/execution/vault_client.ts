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

  private isMissingTokenAccountError(error: unknown): boolean {
    const message = String((error as any)?.message || error || '');
    return /could not find account|account not found|AccountNotFound/i.test(message);
  }

  private async readTokenAccountBalance(
    tokenAccount: PublicKey
  ): Promise<{ amount: string; uiAmountString: string }> {
    try {
      const balance = await this.connection.getTokenAccountBalance(
        tokenAccount,
        'confirmed'
      );
      return {
        amount: balance.value.amount,
        uiAmountString: balance.value.uiAmountString || '0',
      };
    } catch (error) {
      if (this.isMissingTokenAccountError(error)) {
        return { amount: '0', uiAmountString: '0' };
      }

      const message = String((error as any)?.message || error || 'unknown RPC error');
      throw new Error(
        `Unable to read Solana token balance for ${tokenAccount.toBase58()}: ${message}`
      );
    }
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
  private async readVerifiedBasketExecutionState(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<{
    executionSymbol: string;
    basketPda: PublicKey;
    basketMint: PublicKey;
    decoded: any;
  }> {
    const executionSymbol = this.getExecutionSymbol(
      basket,
      useDevnetMirrors
    );
    const [basketPda] = this.getBasketPda(executionSymbol);
    const [basketMint] = this.getBasketMintPda(executionSymbol);

    if (!useDevnetMirrors) {
      if (basketPda.toBase58() !== basket.vaultPda) {
        throw new Error(
          `Registry vault PDA mismatch for ${basket.symbol}.`
        );
      }
      if (basketMint.toBase58() !== basket.basketMint) {
        throw new Error(
          `Registry basket mint mismatch for ${basket.symbol}.`
        );
      }
    }

    // Read the basket account and share mint in one RPC round-trip. This is
    // the hot hydration path used by Baskets/Portfolio, so avoid separate
    // account calls that multiply Devnet 429 pressure.
    const [basketInfo, mintInfo] =
      await this.connection.getMultipleAccountsInfo(
        [basketPda, basketMint],
        'confirmed'
      );

    if (!basketInfo) {
      throw new Error(
        `Basket vault ${basket.symbol} (${executionSymbol}) is not initialized on the connected cluster.`
      );
    }
    if (!basketInfo.owner.equals(this.programId)) {
      throw new Error(
        `Basket vault ${basket.symbol} (${executionSymbol}) is not owned by the SynthaBasket program.`
      );
    }
    if (!mintInfo || !mintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      throw new Error(
        `Basket mint ${basket.symbol} is not initialized as an SPL mint on this cluster.`
      );
    }

    let decoded: any;
    try {
      decoded = this.accountsCoder.decode(
        'BasketState',
        basketInfo.data
      );
    } catch {
      throw new Error(
        `Unable to decode live basket state for ${basket.symbol}; IDL/program version mismatch.`
      );
    }

    const onChainBasketMint = new PublicKey(
      decoded.basketMint
    ).toBase58();
    if (onChainBasketMint !== basketMint.toBase58()) {
      throw new Error(
        `On-chain basket mint does not match the registry for ${basket.symbol}.`
      );
    }

    const onChainSymbol = String(decoded.symbol || '').toUpperCase();
    if (onChainSymbol !== executionSymbol.toUpperCase()) {
      throw new Error(
        `On-chain basket symbol does not match ${executionSymbol}.`
      );
    }

    const expectedName = basket.name.slice(0, 32);
    if (String(decoded.name || '') !== expectedName) {
      throw new Error(
        `On-chain basket name does not match the submitted definition for ${basket.symbol}.`
      );
    }

    const onChainWeights = Array.isArray(decoded.weightsBps)
      ? decoded.weightsBps.map((weight: any) => Number(weight))
      : [];
    const expectedWeights = basket.constituents.map(
      (constituent) => constituent.targetWeightBps
    );

    if (
      onChainWeights.length !== expectedWeights.length ||
      onChainWeights.some(
        (weight: number, index: number) =>
          weight !== expectedWeights[index]
      )
    ) {
      throw new Error(
        `On-chain target weights for ${basket.symbol} do not match the submitted definition.`
      );
    }

    const expectedConstituents = basket.constituents.map(
      (constituent) => {
        const mint = useDevnetMirrors
          ? constituent.asset.devnetMint ||
            getDevnetMirrorMint(constituent.asset.symbol)
          : constituent.asset.tokenMint;
        if (!mint) {
          throw new Error(
            `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${constituent.asset.symbol}.`
          );
        }
        return new PublicKey(mint).toBase58();
      }
    );

    const onChainConstituents = (
      decoded.constituents as PublicKey[]
    ).map((mint) => new PublicKey(mint).toBase58());

    if (
      onChainConstituents.length !== expectedConstituents.length ||
      onChainConstituents.some(
        (mint, index) => mint !== expectedConstituents[index]
      )
    ) {
      throw new Error(
        `On-chain constituent configuration for ${basket.symbol} does not match the active execution mints.`
      );
    }

    return {
      executionSymbol,
      basketPda,
      basketMint,
      decoded,
    };
  }

  async verifyBasketExecutionState(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<void> {
    await this.readVerifiedBasketExecutionState(
      basket,
      useDevnetMirrors
    );
  }

  async getBasketAuthorityByExecutionSymbol(
    executionSymbol: string
  ): Promise<string> {
    const normalizedSymbol = executionSymbol.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,10}$/.test(normalizedSymbol)) {
      throw new Error('Basket execution symbol is invalid.');
    }

    const [basketPda] = this.getBasketPda(normalizedSymbol);
    const basketInfo = await this.connection.getAccountInfo(basketPda, 'confirmed');

    if (!basketInfo) {
      throw new Error(
        `Basket vault ${normalizedSymbol} is not initialized on the connected cluster.`
      );
    }
    if (!basketInfo.owner.equals(this.programId)) {
      throw new Error(
        `Basket vault ${normalizedSymbol} is not owned by the SynthaBasket program.`
      );
    }

    let decoded: any;
    try {
      decoded = this.accountsCoder.decode('BasketState', basketInfo.data);
    } catch {
      throw new Error(
        `Unable to decode live basket state for ${normalizedSymbol}; IDL/program version mismatch.`
      );
    }

    const onChainSymbol = String(decoded.symbol || '').toUpperCase();
    if (onChainSymbol !== normalizedSymbol) {
      throw new Error(
        `On-chain basket symbol does not match ${normalizedSymbol}.`
      );
    }

    return new PublicKey(decoded.authority).toBase58();
  }


  async getBasketAuthority(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<string> {
    await this.verifyBasketExecutionState(basket, useDevnetMirrors);

    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const basketInfo = await this.connection.getAccountInfo(basketPda, 'confirmed');

    if (!basketInfo) {
      throw new Error(`Basket vault ${basket.symbol} is not initialized on the connected cluster.`);
    }

    const decoded: any = this.accountsCoder.decode('BasketState', basketInfo.data);
    return new PublicKey(decoded.authority).toBase58();
  }


  /**
   * Hydrates the execution basket from live Solana state.
   *
   * Supply and reserve accounting are read from the verified BasketState,
   * which the program updates atomically with mint/redeem token transfers.
   * Registry AUM/share counts are never substituted when this method succeeds.
   */
  async getBasketExecutionSnapshot(
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<BasketExecutionSnapshot> {
    const {
      executionSymbol,
      basketPda,
      basketMint,
      decoded,
    } = await this.readVerifiedBasketExecutionState(
      basket,
      useDevnetMirrors
    );

    // BasketState is updated atomically by deposit_and_mint /
    // burn_and_redeem in the same transaction as the token CPIs. For
    // read-only NAV hydration, use those program-accounted reserves instead
    // of issuing one getTokenAccountBalance RPC per constituent.
    const rawReserves = Array.isArray(decoded.vaultReserves)
      ? decoded.vaultReserves.map((value: any) =>
          BigInt(value.toString())
        )
      : [];

    if (rawReserves.length !== basket.constituents.length) {
      throw new Error(
        `Live vault reserve count does not match ${basket.symbol} constituents.`
      );
    }

    const totalSharesRaw = BigInt(
      decoded.totalSharesMinted.toString()
    );
    const basketDecimals = 6;
    const totalSharesMinted =
      Number(totalSharesRaw) / 10 ** basketDecimals;

    const reserves: BasketExecutionSnapshot['reserves'] = [];
    for (let index = 0; index < basket.constituents.length; index += 1) {
      const constituent = basket.constituents[index];
      const executionMint = useDevnetMirrors
        ? constituent.asset.devnetMint ||
          getDevnetMirrorMint(constituent.asset.symbol)
        : constituent.asset.tokenMint;

      if (!executionMint) {
        throw new Error(
          `No executable ${useDevnetMirrors ? 'Devnet mirror ' : ''}mint configured for ${constituent.asset.symbol}.`
        );
      }

      const mint = new PublicKey(executionMint);
      // Every SynthaBasket Devnet execution mirror is created with 6
      // decimals. Mainnet/non-mirror reads retain strict mint lookup.
      const decimals = useDevnetMirrors
        ? 6
        : await this.getMintDecimals(mint);
      const rawAmount = rawReserves[index];

      reserves.push({
        symbol: constituent.asset.symbol,
        mint: mint.toBase58(),
        rawAmount: rawAmount.toString(),
        uiAmount: Number(rawAmount) / 10 ** decimals,
        decimals,
      });
    }

    return {
      executionSymbol,
      basketPda: basketPda.toBase58(),
      basketMint: basketMint.toBase58(),
      totalSharesMinted,
      reserves,
    };
  }

  async getUserTokenBalance(
    userPublicKey: PublicKey,
    mint: PublicKey
  ): Promise<number> {
    const ata = this.getUserTokenAccount(userPublicKey, mint);
    const balance = await this.readTokenAccountBalance(ata);
    return Number(balance.uiAmountString || '0');
  }

  async getUserBasketBalance(
    userPublicKey: PublicKey,
    basket: BasketDefinition,
    useDevnetMirrors: boolean = false
  ): Promise<number> {
    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketMint] = this.getBasketMintPda(executionSymbol);
    return this.getUserTokenBalance(userPublicKey, basketMint);
  }

  /**
   * Calculates the same pro-rata constituent outputs the vault will release
   * for a redemption, directly from the current on-chain reserve state.
   */
  async prepareLiveRedeemQuote(
    basket: BasketDefinition,
    sharesToBurn: number,
    useDevnetMirrors: boolean = false
  ): Promise<BasketRedeemQuote> {
    if (!Number.isFinite(sharesToBurn) || sharesToBurn <= 0) {
      return {
        basketId: basket.id,
        burnBasketTokensAmount: 0,
        expectedUsdcValue: 0,
        constituentsToReturn: basket.constituents.map((constituent) => ({
          asset: constituent.asset,
          tokenAmount: 0,
          valueUsd: 0,
        })),
      };
    }

    const executionSymbol = this.getExecutionSymbol(basket, useDevnetMirrors);
    const [basketPda] = this.getBasketPda(executionSymbol);
    const basketInfo = await this.connection.getAccountInfo(basketPda, 'confirmed');
    if (!basketInfo) {
      throw new Error(`Basket vault ${basket.symbol} is not initialized.`);
    }

    const decoded: any = this.accountsCoder.decode('BasketState', basketInfo.data);
    const totalSharesRaw = BigInt(decoded.totalSharesMinted.toString());
    const sharesRaw = BigInt(Math.floor(sharesToBurn * 1_000_000));

    if (sharesRaw <= 0n) {
      throw new Error('Redemption amount is below the basket precision.');
    }
    if (totalSharesRaw <= 0n || sharesRaw > totalSharesRaw) {
      throw new Error('Redemption amount exceeds the live basket supply.');
    }

    const reserves = (decoded.vaultReserves as any[]).map((value) =>
      BigInt(value.toString())
    );

    if (reserves.length !== basket.constituents.length) {
      throw new Error('Live vault reserve count does not match basket constituents.');
    }

    const constituentsToReturn = [];
    for (let i = 0; i < basket.constituents.length; i += 1) {
      const constituent = basket.constituents[i];
      const executionMint = useDevnetMirrors
        ? constituent.asset.devnetMint || getDevnetMirrorMint(constituent.asset.symbol)
        : constituent.asset.tokenMint;
      if (!executionMint) {
        throw new Error(`No execution mint configured for ${constituent.asset.symbol}.`);
      }

      const decimals = await this.getMintDecimals(new PublicKey(executionMint));
      const rawOut = (reserves[i] * sharesRaw) / totalSharesRaw;
      const tokenAmount = Number(rawOut) / 10 ** decimals;

      constituentsToReturn.push({
        asset: constituent.asset,
        tokenAmount,
        valueUsd: tokenAmount * constituent.asset.priceUsd,
      });
    }

    return {
      basketId: basket.id,
      burnBasketTokensAmount: Number(sharesRaw) / 1_000_000,
      expectedUsdcValue: constituentsToReturn.reduce(
        (sum, item) => sum + item.valueUsd,
        0
      ),
      constituentsToReturn,
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
      const account = await this.readTokenAccountBalance(userAta);

      const requiredRaw = allocation.rawTokenAmount
        ? BigInt(allocation.rawTokenAmount)
        : BigInt(
            Math.floor(
              allocation.estimatedTokensReceived *
                10 ** (await this.getMintDecimals(mint))
            )
          );

      if (BigInt(account.amount) < requiredRaw) return false;
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

    // First issuance establishes reserves. Validate the exact executable
    // amounts rather than accepting a display-only quote with a zero leg.
    if (totalShares === 0n) {
      const sharesRaw = BigInt(
        Math.floor(quote.expectedBasketTokens * 1_000_000)
      );
      if (sharesRaw <= 0n) {
        throw new Error('First basket issuance would mint zero shares.');
      }

      for (const allocation of quote.allocations) {
        if (!allocation.rawTokenAmount || BigInt(allocation.rawTokenAmount) <= 0n) {
          throw new Error(
            `First basket issuance requires a positive confirmed amount for ${allocation.asset.symbol}.`
          );
        }
      }

      return quote;
    }

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
      const account = await this.readTokenAccountBalance(userAta);

      const requiredRaw = allocation.rawTokenAmount
        ? BigInt(allocation.rawTokenAmount)
        : BigInt(
            Math.floor(
              allocation.estimatedTokensReceived * 10 ** (await this.getMintDecimals(mint))
            )
          );

      const availableRaw = BigInt(account.amount);
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
    if (sharesToMintRaw <= 0n) {
      throw new Error('Mint amount is below the basket share precision.');
    }
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
    // A real recent blockhash is attached by the execution layer immediately
    // before simulation/signing. Never substitute a made-up blockhash here.
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
    if (sharesToBurnRaw <= 0n) {
      throw new Error('Redemption amount is below the basket share precision.');
    }
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
    // A real recent blockhash is attached by the execution layer immediately
    // before simulation/signing. Never substitute a made-up blockhash here.
    tx.feePayer = userPublicKey;

    return tx;
  }
}
