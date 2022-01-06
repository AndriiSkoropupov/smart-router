"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseCommand = void 0;
/// <reference types="./types/bunyan-debug-stream" />
const command_1 = require("@oclif/command");
const default_token_list_1 = __importDefault(require("@uniswap/default-token-list"));
const bunyan_1 = __importDefault(require("bunyan"));
const bunyan_debug_stream_1 = __importDefault(require("bunyan-debug-stream"));
const ethers_1 = require("ethers");
const node_cache_1 = __importDefault(require("node-cache"));
const src_1 = require("../src");
const legacy_gas_price_provider_1 = require("../src/providers/legacy-gas-price-provider");
const on_chain_gas_price_provider_1 = require("../src/providers/on-chain-gas-price-provider");
class BaseCommand extends command_1.Command {
    constructor() {
        super(...arguments);
        this._log = null;
        this._router = null;
        this._swapToRatioRouter = null;
        this._tokenProvider = null;
        this._poolProvider = null;
        this._blockNumber = null;
        this._multicall2Provider = null;
    }
    get logger() {
        return this._log
            ? this._log
            : bunyan_1.default.createLogger({
                name: 'Default Logger',
            });
    }
    get router() {
        if (this._router) {
            return this._router;
        }
        else {
            throw 'router not initialized';
        }
    }
    get swapToRatioRouter() {
        if (this._swapToRatioRouter) {
            return this._swapToRatioRouter;
        }
        else {
            throw 'swapToRatioRouter not initialized';
        }
    }
    get tokenProvider() {
        if (this._tokenProvider) {
            return this._tokenProvider;
        }
        else {
            throw 'tokenProvider not initialized';
        }
    }
    get poolProvider() {
        if (this._poolProvider) {
            return this._poolProvider;
        }
        else {
            throw 'poolProvider not initialized';
        }
    }
    get blockNumber() {
        if (this._blockNumber) {
            return this._blockNumber;
        }
        else {
            throw 'blockNumber not initialized';
        }
    }
    get multicall2Provider() {
        if (this._multicall2Provider) {
            return this._multicall2Provider;
        }
        else {
            throw 'multicall2 not initialized';
        }
    }
    async init() {
        const query = this.parse();
        const { chainId: chainIdNumb, router: routerStr, debug, debugJSON, tokenListURI, } = query.flags;
        // initialize logger
        const logLevel = debug || debugJSON ? bunyan_1.default.DEBUG : bunyan_1.default.INFO;
        this._log = bunyan_1.default.createLogger({
            name: 'Uniswap Smart Order Router',
            serializers: bunyan_1.default.stdSerializers,
            level: logLevel,
            streams: debugJSON
                ? undefined
                : [
                    {
                        level: logLevel,
                        type: 'stream',
                        stream: (0, bunyan_debug_stream_1.default)({
                            basepath: __dirname,
                            forceColor: false,
                            showDate: false,
                            showPid: false,
                            showLoggerName: false,
                            showLevel: !!debug,
                        }),
                    },
                ],
        });
        if (debug || debugJSON) {
            (0, src_1.setGlobalLogger)(this.logger);
        }
        const metricLogger = new src_1.MetricLogger();
        (0, src_1.setGlobalMetric)(metricLogger);
        const chainId = (0, src_1.ID_TO_CHAIN_ID)(chainIdNumb);
        const chainProvider = (0, src_1.ID_TO_PROVIDER)(chainId);
        const provider = new ethers_1.ethers.providers.JsonRpcProvider(chainProvider, chainId);
        this._blockNumber = await provider.getBlockNumber();
        const tokenCache = new src_1.NodeJSCache(new node_cache_1.default({ stdTTL: 3600, useClones: false }));
        let tokenListProvider;
        if (tokenListURI) {
            tokenListProvider = await src_1.CachingTokenListProvider.fromTokenListURI(chainId, tokenListURI, tokenCache);
        }
        else {
            tokenListProvider = await src_1.CachingTokenListProvider.fromTokenList(chainId, default_token_list_1.default, tokenCache);
        }
        const multicall2Provider = new src_1.UniswapMulticallProvider(chainId, provider);
        this._multicall2Provider = multicall2Provider;
        this._poolProvider = new src_1.V3PoolProvider(chainId, multicall2Provider);
        // initialize tokenProvider
        const tokenProviderOnChain = new src_1.TokenProvider(chainId, multicall2Provider);
        this._tokenProvider = new src_1.CachingTokenProviderWithFallback(chainId, tokenCache, tokenListProvider, tokenProviderOnChain);
        if (routerStr == 'legacy') {
            this._router = new src_1.LegacyRouter({
                chainId,
                multicall2Provider,
                poolProvider: new src_1.V3PoolProvider(chainId, multicall2Provider),
                quoteProvider: new src_1.V3QuoteProvider(chainId, provider, multicall2Provider),
                tokenProvider: this.tokenProvider,
            });
        }
        else {
            const gasPriceCache = new src_1.NodeJSCache(new node_cache_1.default({ stdTTL: 15, useClones: true }));
            // const useDefaultQuoteProvider =
            //   chainId != ChainId.ARBITRUM_ONE && chainId != ChainId.ARBITRUM_RINKEBY;
            const router = new src_1.AlphaRouter({
                provider,
                chainId,
                multicall2Provider: multicall2Provider,
                gasPriceProvider: new src_1.CachingGasStationProvider(chainId, new on_chain_gas_price_provider_1.OnChainGasPriceProvider(chainId, new src_1.EIP1559GasPriceProvider(provider), new legacy_gas_price_provider_1.LegacyGasPriceProvider(provider)), gasPriceCache),
            });
            this._swapToRatioRouter = router;
            this._router = router;
        }
    }
    logSwapResults(routeAmounts, quote, quoteGasAdjusted, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, methodParameters, blockNumber, estimatedGasUsed, gasPriceWei) {
        this.logger.info(`Best Route:`);
        this.logger.info(`${(0, src_1.routeAmountsToString)(routeAmounts)}`);
        this.logger.info(`\tRaw Quote Exact In:`);
        this.logger.info(`\t\t${quote.toFixed(2)}`);
        this.logger.info(`\tGas Adjusted Quote In:`);
        this.logger.info(`\t\t${quoteGasAdjusted.toFixed(2)}`);
        this.logger.info(``);
        this.logger.info(`Gas Used Quote Token: ${estimatedGasUsedQuoteToken.toFixed(6)}`);
        this.logger.info(`Gas Used USD: ${estimatedGasUsedUSD.toFixed(6)}`);
        this.logger.info(`Calldata: ${methodParameters === null || methodParameters === void 0 ? void 0 : methodParameters.calldata}`);
        this.logger.info(`Value: ${methodParameters === null || methodParameters === void 0 ? void 0 : methodParameters.value}`);
        this.logger.info({
            blockNumber: blockNumber.toString(),
            estimatedGasUsed: estimatedGasUsed.toString(),
            gasPriceWei: gasPriceWei.toString(),
        });
    }
}
exports.BaseCommand = BaseCommand;
BaseCommand.flags = {
    topN: command_1.flags.integer({
        required: false,
        default: 3,
    }),
    topNTokenInOut: command_1.flags.integer({
        required: false,
        default: 2,
    }),
    topNSecondHop: command_1.flags.integer({
        required: false,
        default: 0,
    }),
    topNWithEachBaseToken: command_1.flags.integer({
        required: false,
        default: 2,
    }),
    topNWithBaseToken: command_1.flags.integer({
        required: false,
        default: 6,
    }),
    topNWithBaseTokenInSet: command_1.flags.boolean({
        required: false,
        default: false,
    }),
    topNDirectSwaps: command_1.flags.integer({
        required: false,
        default: 2,
    }),
    maxSwapsPerPath: command_1.flags.integer({
        required: false,
        default: 3,
    }),
    minSplits: command_1.flags.integer({
        required: false,
        default: 1,
    }),
    maxSplits: command_1.flags.integer({
        required: false,
        default: 3,
    }),
    distributionPercent: command_1.flags.integer({
        required: false,
        default: 5,
    }),
    chainId: command_1.flags.integer({
        char: 'c',
        required: false,
        default: src_1.ChainId.MAINNET,
        options: src_1.CHAIN_IDS_LIST,
    }),
    tokenListURI: command_1.flags.string({
        required: false,
    }),
    router: command_1.flags.string({
        char: 's',
        required: false,
        default: 'alpha',
    }),
    debug: command_1.flags.boolean(),
    debugJSON: command_1.flags.boolean(),
};
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYmFzZS1jb21tYW5kLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vY2xpL2Jhc2UtY29tbWFuZC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxxREFBcUQ7QUFDckQsNENBQWdEO0FBRWhELHFGQUE2RDtBQUc3RCxvREFBOEQ7QUFDOUQsOEVBQW9EO0FBQ3BELG1DQUEyQztBQUMzQyw0REFBbUM7QUFDbkMsZ0NBMEJnQjtBQUNoQiwwRkFBb0Y7QUFDcEYsOEZBQXVGO0FBRXZGLE1BQXNCLFdBQVksU0FBUSxpQkFBTztJQUFqRDs7UUFnRVUsU0FBSSxHQUFrQixJQUFJLENBQUM7UUFDM0IsWUFBTyxHQUF3QixJQUFJLENBQUM7UUFDcEMsdUJBQWtCLEdBQWtDLElBQUksQ0FBQztRQUN6RCxtQkFBYyxHQUEwQixJQUFJLENBQUM7UUFDN0Msa0JBQWEsR0FBMkIsSUFBSSxDQUFDO1FBQzdDLGlCQUFZLEdBQWtCLElBQUksQ0FBQztRQUNuQyx3QkFBbUIsR0FBb0MsSUFBSSxDQUFDO0lBbU50RSxDQUFDO0lBak5DLElBQUksTUFBTTtRQUNSLE9BQU8sSUFBSSxDQUFDLElBQUk7WUFDZCxDQUFDLENBQUMsSUFBSSxDQUFDLElBQUk7WUFDWCxDQUFDLENBQUMsZ0JBQU0sQ0FBQyxZQUFZLENBQUM7Z0JBQ2xCLElBQUksRUFBRSxnQkFBZ0I7YUFDdkIsQ0FBQyxDQUFDO0lBQ1QsQ0FBQztJQUVELElBQUksTUFBTTtRQUNSLElBQUksSUFBSSxDQUFDLE9BQU8sRUFBRTtZQUNoQixPQUFPLElBQUksQ0FBQyxPQUFPLENBQUM7U0FDckI7YUFBTTtZQUNMLE1BQU0sd0JBQXdCLENBQUM7U0FDaEM7SUFDSCxDQUFDO0lBRUQsSUFBSSxpQkFBaUI7UUFDbkIsSUFBSSxJQUFJLENBQUMsa0JBQWtCLEVBQUU7WUFDM0IsT0FBTyxJQUFJLENBQUMsa0JBQWtCLENBQUM7U0FDaEM7YUFBTTtZQUNMLE1BQU0sbUNBQW1DLENBQUM7U0FDM0M7SUFDSCxDQUFDO0lBRUQsSUFBSSxhQUFhO1FBQ2YsSUFBSSxJQUFJLENBQUMsY0FBYyxFQUFFO1lBQ3ZCLE9BQU8sSUFBSSxDQUFDLGNBQWMsQ0FBQztTQUM1QjthQUFNO1lBQ0wsTUFBTSwrQkFBK0IsQ0FBQztTQUN2QztJQUNILENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZCxJQUFJLElBQUksQ0FBQyxhQUFhLEVBQUU7WUFDdEIsT0FBTyxJQUFJLENBQUMsYUFBYSxDQUFDO1NBQzNCO2FBQU07WUFDTCxNQUFNLDhCQUE4QixDQUFDO1NBQ3RDO0lBQ0gsQ0FBQztJQUVELElBQUksV0FBVztRQUNiLElBQUksSUFBSSxDQUFDLFlBQVksRUFBRTtZQUNyQixPQUFPLElBQUksQ0FBQyxZQUFZLENBQUM7U0FDMUI7YUFBTTtZQUNMLE1BQU0sNkJBQTZCLENBQUM7U0FDckM7SUFDSCxDQUFDO0lBRUQsSUFBSSxrQkFBa0I7UUFDcEIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLEVBQUU7WUFDNUIsT0FBTyxJQUFJLENBQUMsbUJBQW1CLENBQUM7U0FDakM7YUFBTTtZQUNMLE1BQU0sNEJBQTRCLENBQUM7U0FDcEM7SUFDSCxDQUFDO0lBRUQsS0FBSyxDQUFDLElBQUk7UUFDUixNQUFNLEtBQUssR0FBMkIsSUFBSSxDQUFDLEtBQUssRUFBRSxDQUFDO1FBQ25ELE1BQU0sRUFDSixPQUFPLEVBQUUsV0FBVyxFQUNwQixNQUFNLEVBQUUsU0FBUyxFQUNqQixLQUFLLEVBQ0wsU0FBUyxFQUNULFlBQVksR0FDYixHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUM7UUFFaEIsb0JBQW9CO1FBQ3BCLE1BQU0sUUFBUSxHQUFHLEtBQUssSUFBSSxTQUFTLENBQUMsQ0FBQyxDQUFDLGdCQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxnQkFBTSxDQUFDLElBQUksQ0FBQztRQUNqRSxJQUFJLENBQUMsSUFBSSxHQUFHLGdCQUFNLENBQUMsWUFBWSxDQUFDO1lBQzlCLElBQUksRUFBRSw0QkFBNEI7WUFDbEMsV0FBVyxFQUFFLGdCQUFNLENBQUMsY0FBYztZQUNsQyxLQUFLLEVBQUUsUUFBUTtZQUNmLE9BQU8sRUFBRSxTQUFTO2dCQUNoQixDQUFDLENBQUMsU0FBUztnQkFDWCxDQUFDLENBQUM7b0JBQ0U7d0JBQ0UsS0FBSyxFQUFFLFFBQVE7d0JBQ2YsSUFBSSxFQUFFLFFBQVE7d0JBQ2QsTUFBTSxFQUFFLElBQUEsNkJBQWlCLEVBQUM7NEJBQ3hCLFFBQVEsRUFBRSxTQUFTOzRCQUNuQixVQUFVLEVBQUUsS0FBSzs0QkFDakIsUUFBUSxFQUFFLEtBQUs7NEJBQ2YsT0FBTyxFQUFFLEtBQUs7NEJBQ2QsY0FBYyxFQUFFLEtBQUs7NEJBQ3JCLFNBQVMsRUFBRSxDQUFDLENBQUMsS0FBSzt5QkFDbkIsQ0FBQztxQkFDSDtpQkFDRjtTQUNOLENBQUMsQ0FBQztRQUVILElBQUksS0FBSyxJQUFJLFNBQVMsRUFBRTtZQUN0QixJQUFBLHFCQUFlLEVBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1NBQzlCO1FBRUQsTUFBTSxZQUFZLEdBQWlCLElBQUksa0JBQVksRUFBRSxDQUFDO1FBQ3RELElBQUEscUJBQWUsRUFBQyxZQUFZLENBQUMsQ0FBQztRQUU5QixNQUFNLE9BQU8sR0FBRyxJQUFBLG9CQUFjLEVBQUMsV0FBVyxDQUFDLENBQUM7UUFDNUMsTUFBTSxhQUFhLEdBQUcsSUFBQSxvQkFBYyxFQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRTlDLE1BQU0sUUFBUSxHQUFHLElBQUksZUFBTSxDQUFDLFNBQVMsQ0FBQyxlQUFlLENBQ25ELGFBQWEsRUFDYixPQUFPLENBQ1IsQ0FBQztRQUNGLElBQUksQ0FBQyxZQUFZLEdBQUcsTUFBTSxRQUFRLENBQUMsY0FBYyxFQUFFLENBQUM7UUFFcEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxpQkFBVyxDQUNoQyxJQUFJLG9CQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQyxDQUNsRCxDQUFDO1FBRUYsSUFBSSxpQkFBMkMsQ0FBQztRQUNoRCxJQUFJLFlBQVksRUFBRTtZQUNoQixpQkFBaUIsR0FBRyxNQUFNLDhCQUF3QixDQUFDLGdCQUFnQixDQUNqRSxPQUFPLEVBQ1AsWUFBWSxFQUNaLFVBQVUsQ0FDWCxDQUFDO1NBQ0g7YUFBTTtZQUNMLGlCQUFpQixHQUFHLE1BQU0sOEJBQXdCLENBQUMsYUFBYSxDQUM5RCxPQUFPLEVBQ1AsNEJBQWtCLEVBQ2xCLFVBQVUsQ0FDWCxDQUFDO1NBQ0g7UUFFRCxNQUFNLGtCQUFrQixHQUFHLElBQUksOEJBQXdCLENBQUMsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBQzNFLElBQUksQ0FBQyxtQkFBbUIsR0FBRyxrQkFBa0IsQ0FBQztRQUM5QyxJQUFJLENBQUMsYUFBYSxHQUFHLElBQUksb0JBQWMsQ0FBQyxPQUFPLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztRQUVyRSwyQkFBMkI7UUFDM0IsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLG1CQUFhLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDLENBQUM7UUFDNUUsSUFBSSxDQUFDLGNBQWMsR0FBRyxJQUFJLHNDQUFnQyxDQUN4RCxPQUFPLEVBQ1AsVUFBVSxFQUNWLGlCQUFpQixFQUNqQixvQkFBb0IsQ0FDckIsQ0FBQztRQUVGLElBQUksU0FBUyxJQUFJLFFBQVEsRUFBRTtZQUN6QixJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksa0JBQVksQ0FBQztnQkFDOUIsT0FBTztnQkFDUCxrQkFBa0I7Z0JBQ2xCLFlBQVksRUFBRSxJQUFJLG9CQUFjLENBQUMsT0FBTyxFQUFFLGtCQUFrQixDQUFDO2dCQUM3RCxhQUFhLEVBQUUsSUFBSSxxQkFBZSxDQUNoQyxPQUFPLEVBQ1AsUUFBUSxFQUNSLGtCQUFrQixDQUNuQjtnQkFDRCxhQUFhLEVBQUUsSUFBSSxDQUFDLGFBQWE7YUFDbEMsQ0FBQyxDQUFDO1NBQ0o7YUFBTTtZQUNMLE1BQU0sYUFBYSxHQUFHLElBQUksaUJBQVcsQ0FDbkMsSUFBSSxvQkFBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FDL0MsQ0FBQztZQUVGLGtDQUFrQztZQUNsQyw0RUFBNEU7WUFFNUUsTUFBTSxNQUFNLEdBQUcsSUFBSSxpQkFBVyxDQUFDO2dCQUM3QixRQUFRO2dCQUNSLE9BQU87Z0JBQ1Asa0JBQWtCLEVBQUUsa0JBQWtCO2dCQUN0QyxnQkFBZ0IsRUFBRSxJQUFJLCtCQUF5QixDQUM3QyxPQUFPLEVBQ1AsSUFBSSxxREFBdUIsQ0FDekIsT0FBTyxFQUNQLElBQUksNkJBQXVCLENBQUMsUUFBUSxDQUFDLEVBQ3JDLElBQUksa0RBQXNCLENBQUMsUUFBUSxDQUFDLENBQ3JDLEVBQ0QsYUFBYSxDQUNkO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsSUFBSSxDQUFDLGtCQUFrQixHQUFHLE1BQU0sQ0FBQztZQUNqQyxJQUFJLENBQUMsT0FBTyxHQUFHLE1BQU0sQ0FBQztTQUN2QjtJQUNILENBQUM7SUFFRCxjQUFjLENBQ1osWUFBbUMsRUFDbkMsS0FBK0IsRUFDL0IsZ0JBQTBDLEVBQzFDLDBCQUFvRCxFQUNwRCxtQkFBNkMsRUFDN0MsZ0JBQThDLEVBQzlDLFdBQXNCLEVBQ3RCLGdCQUEyQixFQUMzQixXQUFzQjtRQUV0QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUEsMEJBQW9CLEVBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1FBRTFELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixDQUFDLENBQUM7UUFDMUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUM1QyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO1FBQzdDLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sZ0JBQWdCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUN2RCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNyQixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FDZCx5QkFBeUIsMEJBQTBCLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQ2pFLENBQUM7UUFDRixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxpQkFBaUIsbUJBQW1CLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNwRSxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxhQUFhLGdCQUFnQixhQUFoQixnQkFBZ0IsdUJBQWhCLGdCQUFnQixDQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDNUQsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxnQkFBZ0IsYUFBaEIsZ0JBQWdCLHVCQUFoQixnQkFBZ0IsQ0FBRSxLQUFLLEVBQUUsQ0FBQyxDQUFDO1FBQ3RELElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDO1lBQ2YsV0FBVyxFQUFFLFdBQVcsQ0FBQyxRQUFRLEVBQUU7WUFDbkMsZ0JBQWdCLEVBQUUsZ0JBQWdCLENBQUMsUUFBUSxFQUFFO1lBQzdDLFdBQVcsRUFBRSxXQUFXLENBQUMsUUFBUSxFQUFFO1NBQ3BDLENBQUMsQ0FBQztJQUNMLENBQUM7O0FBeFJILGtDQXlSQztBQXhSUSxpQkFBSyxHQUFHO0lBQ2IsSUFBSSxFQUFFLGVBQUssQ0FBQyxPQUFPLENBQUM7UUFDbEIsUUFBUSxFQUFFLEtBQUs7UUFDZixPQUFPLEVBQUUsQ0FBQztLQUNYLENBQUM7SUFDRixjQUFjLEVBQUUsZUFBSyxDQUFDLE9BQU8sQ0FBQztRQUM1QixRQUFRLEVBQUUsS0FBSztRQUNmLE9BQU8sRUFBRSxDQUFDO0tBQ1gsQ0FBQztJQUNGLGFBQWEsRUFBRSxlQUFLLENBQUMsT0FBTyxDQUFDO1FBQzNCLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLENBQUM7S0FDWCxDQUFDO0lBQ0YscUJBQXFCLEVBQUUsZUFBSyxDQUFDLE9BQU8sQ0FBQztRQUNuQyxRQUFRLEVBQUUsS0FBSztRQUNmLE9BQU8sRUFBRSxDQUFDO0tBQ1gsQ0FBQztJQUNGLGlCQUFpQixFQUFFLGVBQUssQ0FBQyxPQUFPLENBQUM7UUFDL0IsUUFBUSxFQUFFLEtBQUs7UUFDZixPQUFPLEVBQUUsQ0FBQztLQUNYLENBQUM7SUFDRixzQkFBc0IsRUFBRSxlQUFLLENBQUMsT0FBTyxDQUFDO1FBQ3BDLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLEtBQUs7S0FDZixDQUFDO0lBQ0YsZUFBZSxFQUFFLGVBQUssQ0FBQyxPQUFPLENBQUM7UUFDN0IsUUFBUSxFQUFFLEtBQUs7UUFDZixPQUFPLEVBQUUsQ0FBQztLQUNYLENBQUM7SUFDRixlQUFlLEVBQUUsZUFBSyxDQUFDLE9BQU8sQ0FBQztRQUM3QixRQUFRLEVBQUUsS0FBSztRQUNmLE9BQU8sRUFBRSxDQUFDO0tBQ1gsQ0FBQztJQUNGLFNBQVMsRUFBRSxlQUFLLENBQUMsT0FBTyxDQUFDO1FBQ3ZCLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLENBQUM7S0FDWCxDQUFDO0lBQ0YsU0FBUyxFQUFFLGVBQUssQ0FBQyxPQUFPLENBQUM7UUFDdkIsUUFBUSxFQUFFLEtBQUs7UUFDZixPQUFPLEVBQUUsQ0FBQztLQUNYLENBQUM7SUFDRixtQkFBbUIsRUFBRSxlQUFLLENBQUMsT0FBTyxDQUFDO1FBQ2pDLFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLENBQUM7S0FDWCxDQUFDO0lBQ0YsT0FBTyxFQUFFLGVBQUssQ0FBQyxPQUFPLENBQUM7UUFDckIsSUFBSSxFQUFFLEdBQUc7UUFDVCxRQUFRLEVBQUUsS0FBSztRQUNmLE9BQU8sRUFBRSxhQUFPLENBQUMsT0FBTztRQUN4QixPQUFPLEVBQUUsb0JBQWM7S0FDeEIsQ0FBQztJQUNGLFlBQVksRUFBRSxlQUFLLENBQUMsTUFBTSxDQUFDO1FBQ3pCLFFBQVEsRUFBRSxLQUFLO0tBQ2hCLENBQUM7SUFDRixNQUFNLEVBQUUsZUFBSyxDQUFDLE1BQU0sQ0FBQztRQUNuQixJQUFJLEVBQUUsR0FBRztRQUNULFFBQVEsRUFBRSxLQUFLO1FBQ2YsT0FBTyxFQUFFLE9BQU87S0FDakIsQ0FBQztJQUNGLEtBQUssRUFBRSxlQUFLLENBQUMsT0FBTyxFQUFFO0lBQ3RCLFNBQVMsRUFBRSxlQUFLLENBQUMsT0FBTyxFQUFFO0NBQzNCLENBQUMifQ==