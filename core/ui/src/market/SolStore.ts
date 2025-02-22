import {
  CandyShop,
  CandyShopTrade,
  CandyShopTradeBuyParams,
  CandyShopTradeCancelParams,
  CandyShopTradeSellParams,
  fetchNftsFromWallet,
  fetchShopByShopAddress,
  getCandyShopSync,
  getTokenMetadataByMintAddress,
  NftMetadata,
  SingleTokenInfo
} from '@liqnft/candy-shop-sdk';
import {
  Order,
  Auction,
  WhitelistNft,
  ListBase,
  SingleBase,
  Nft,
  CandyShop as CandyShopResponse
} from '@liqnft/candy-shop-types';
import { BN, web3 } from '@project-serum/anchor';
import { AnchorWallet } from '@solana/wallet-adapter-react';
import { SolSellerOptions, Store, Auctionner } from './catalog';

export class SolStore extends Store implements Auctionner {
  private wallet: AnchorWallet;
  private connection: web3.Connection;
  private isEnterprise: boolean;

  constructor(shop: CandyShop, wallet: AnchorWallet, connection: web3.Connection, isEnterprise: boolean) {
    super(shop);
    this.wallet = wallet;
    this.connection = connection;
    this.isEnterprise = isEnterprise;
  }

  /* Specific methods for Sols */

  getTokenMetadataByMintAddress(mintAddress: string, connection: web3.Connection): Promise<NftMetadata> {
    return getTokenMetadataByMintAddress(mintAddress, connection);
  }

  getShopIdentifiers(): Promise<string[]> {
    return this.shop
      .shopWlNfts()
      .then((nfts: ListBase<WhitelistNft>) =>
        nfts.result.reduce((arr: string[], item: WhitelistNft) => arr.concat(item.identifier), [])
      );
  }

  /* Implement required common methods */

  getShop(): Promise<CandyShopResponse> {
    const candyShopAddress = this.shop.candyShopAddress.toString();
    return fetchShopByShopAddress(candyShopAddress).then((data) =>
      data.success ? data.result : ({} as CandyShopResponse)
    );
  }

  getNftInfo(tokenMint: string): Promise<Nft> {
    return this.shop.nftInfo(tokenMint);
  }

  async getNFTs(
    walletPublicKey: string,
    options: { enableCacheNFT?: boolean; allowSellAnyNft?: number }
  ): Promise<SingleTokenInfo[]> {
    const fetchBatchParam: any = {
      batchSize: 8
    };
    // Enable cache nft, store nft token in IDB and get nft token from IDB.
    // CandyShopSDK will always keep up-to-date status from chain in IDB once fetchNFT is called.
    const cacheNFTParam: any = {
      enable: options.enableCacheNFT ?? false
    };

    const identifiers = options.allowSellAnyNft ? undefined : await this.getShopIdentifiers();

    return fetchNftsFromWallet(
      this.connection,
      new web3.PublicKey(walletPublicKey),
      identifiers,
      fetchBatchParam,
      cacheNFTParam
    );
  }

  getOrderNft(tokenMint: string): Promise<SingleBase<Order>> {
    return this.shop.activeOrderByMintAddress(tokenMint);
  }

  buy(order: Order): Promise<string> {
    if (!this.wallet?.publicKey) {
      throw new Error(`Invalid Anchor wallet or publicKey doesn't exist`);
    }
    if (!this.connection) {
      throw new Error(`Invalid Solana shop connection`);
    }

    const shopAddress = getCandyShopSync(
      new web3.PublicKey(order.candyShopCreatorAddress),
      new web3.PublicKey(order.treasuryMint),
      new web3.PublicKey(order.programId)
    )[0].toString();

    const tradeBuyParams: CandyShopTradeBuyParams = {
      tokenAccount: new web3.PublicKey(order.tokenAccount),
      tokenMint: new web3.PublicKey(order.tokenMint),
      price: new BN(order.price),
      wallet: this.wallet,
      seller: new web3.PublicKey(order.walletAddress),
      connection: this.connection,
      shopAddress: new web3.PublicKey(shopAddress),
      candyShopProgramId: new web3.PublicKey(order.programId),
      isEnterprise: this.isEnterprise,
      shopCreatorAddress: new web3.PublicKey(order.candyShopCreatorAddress),
      shopTreasuryMint: new web3.PublicKey(order.treasuryMint)
    };

    return CandyShopTrade.buy(tradeBuyParams);
  }

  sell(nft: SingleTokenInfo, price: number, options: SolSellerOptions): Promise<string> {
    const { baseUnitsPerCurrency, shopAddress, shopCreatorAddress, shopTreasuryMint, candyShopProgramId } =
      options as SolSellerOptions;

    if (!this.wallet) return Promise.reject('Wallet not found');
    if (!candyShopProgramId) return Promise.reject('candyShopProgramId not found');

    const tradeSellParams: CandyShopTradeSellParams = {
      connection: this.connection,
      tokenAccount: new web3.PublicKey(nft.tokenAccountAddress),
      tokenMint: new web3.PublicKey(nft.tokenMintAddress),
      price: new BN(price * baseUnitsPerCurrency),
      wallet: this.wallet,
      shopAddress: new web3.PublicKey(shopAddress),
      candyShopProgramId: new web3.PublicKey(candyShopProgramId),
      shopTreasuryMint: new web3.PublicKey(shopTreasuryMint),
      shopCreatorAddress: new web3.PublicKey(shopCreatorAddress)
    };

    return CandyShopTrade.sell(tradeSellParams);
  }

  cancel(order: Order): Promise<string> {
    if (!this.wallet?.publicKey) {
      throw new Error(`Invalid wallet or publicKey doesn't exist`);
    }

    const shopAddress =
      getCandyShopSync(
        new web3.PublicKey(order.candyShopCreatorAddress),
        new web3.PublicKey(order.treasuryMint),
        new web3.PublicKey(order.programId)
      )[0].toString() || '';

    const tradeCancelParams: CandyShopTradeCancelParams = {
      connection: this.connection,
      tokenAccount: new web3.PublicKey(order.tokenAccount),
      tokenMint: new web3.PublicKey(order.tokenMint),
      price: new BN(order.price),
      wallet: this.wallet,
      shopAddress: new web3.PublicKey(shopAddress),
      candyShopProgramId: new web3.PublicKey(order.programId),
      shopTreasuryMint: new web3.PublicKey(order.treasuryMint),
      shopCreatorAddress: new web3.PublicKey(order.candyShopCreatorAddress)
    };

    return CandyShopTrade.cancel(tradeCancelParams);
  }

  withdrawAuctionBid(auction: Auction): Promise<string> {
    if (!this.wallet) return Promise.reject('Wallet not found');

    return this.shop.withdrawAuctionBid({
      wallet: this.wallet,
      tokenMint: new web3.PublicKey(auction.tokenMint),
      tokenAccount: new web3.PublicKey(auction.tokenAccount)
    });
  }

  bidAuction(auction: Auction, price: number): Promise<string> {
    if (!this.wallet) return Promise.reject('Wallet not found');

    return this.shop.bidAuction({
      wallet: this.wallet,
      tokenMint: new web3.PublicKey(auction.tokenMint),
      tokenAccount: new web3.PublicKey(auction.tokenAccount),
      bidPrice: new BN(price * this.shop.baseUnitsPerCurrency)
    });
  }

  buyNowAuction(auction: Auction): Promise<string> {
    if (!this.wallet) return Promise.reject('Wallet not found');

    return this.shop.buyNowAuction({
      wallet: this.wallet,
      tokenMint: new web3.PublicKey(auction.tokenMint),
      tokenAccount: new web3.PublicKey(auction.tokenAccount)
    });
  }

  createAuction(params: any): Promise<string> {
    return this.shop.createAuction(params);
  }
}
