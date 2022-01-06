"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Quote = void 0;
const command_1 = require("@oclif/command");
const router_sdk_1 = require("@uniswap/router-sdk");
const sdk_core_1 = require("@uniswap/sdk-core");
const dotenv_1 = __importDefault(require("dotenv"));
const ethers_1 = require("ethers");
const lodash_1 = __importDefault(require("lodash"));
const src_1 = require("../../src");
const protocols_1 = require("../../src/util/protocols");
const base_command_1 = require("../base-command");
dotenv_1.default.config();
ethers_1.ethers.utils.Logger.globalLogger();
ethers_1.ethers.utils.Logger.setLogLevel(ethers_1.ethers.utils.Logger.levels.DEBUG);
class Quote extends base_command_1.BaseCommand {
    async run() {
        const { flags } = this.parse(Quote);
        const { tokenIn: tokenInStr, tokenOut: tokenOutStr, amount: amountStr, exactIn, exactOut, recipient, debug, topN, topNTokenInOut, topNSecondHop, topNWithEachBaseToken, topNWithBaseToken, topNWithBaseTokenInSet, topNDirectSwaps, maxSwapsPerPath, minSplits, maxSplits, distributionPercent, chainId: chainIdNumb, protocols: protocolsStr, forceCrossProtocol, deadline, } = flags;
        if ((exactIn && exactOut) || (!exactIn && !exactOut)) {
            throw new Error('Must set either --exactIn or --exactOut.');
        }
        let protocols = [];
        if (protocolsStr) {
            try {
                protocols = lodash_1.default.map(protocolsStr.split(','), (protocolStr) => (0, protocols_1.TO_PROTOCOL)(protocolStr));
            }
            catch (err) {
                throw new Error(`Protocols invalid. Valid options: ${Object.values(router_sdk_1.Protocol)}`);
            }
        }
        const chainId = (0, src_1.ID_TO_CHAIN_ID)(chainIdNumb);
        const log = this.logger;
        const tokenProvider = this.tokenProvider;
        const router = this.router;
        const tokenAccessor = await tokenProvider.getTokens([
            tokenInStr === 'ETHER' ? 'ETH' : tokenInStr,
            tokenOutStr,
        ]);
        // if the tokenIn str is 'ETH' or 'MATIC' or NATIVE_CURRENCY_STRING
        const tokenIn = tokenInStr in src_1.NativeCurrencyName
            ? (0, src_1.nativeOnChain)(chainId)
            : tokenAccessor.getTokenByAddress(tokenInStr);
        const tokenOut = tokenOutStr in src_1.NativeCurrencyName
            ? (0, src_1.nativeOnChain)(chainId)
            : tokenAccessor.getTokenByAddress(tokenOutStr);
        let swapRoutes;
        if (exactIn) {
            const amountIn = (0, src_1.parseAmount)(amountStr, tokenIn);
            swapRoutes = await router.route(amountIn, tokenOut, sdk_core_1.TradeType.EXACT_INPUT, recipient
                ? {
                    deadline: deadline || 100,
                    recipient,
                    slippageTolerance: new sdk_core_1.Percent(5, 10000),
                }
                : undefined, {
                blockNumber: this.blockNumber,
                v3PoolSelection: {
                    topN,
                    topNTokenInOut,
                    topNSecondHop,
                    topNWithEachBaseToken,
                    topNWithBaseToken,
                    topNWithBaseTokenInSet,
                    topNDirectSwaps,
                },
                maxSwapsPerPath,
                minSplits,
                maxSplits,
                distributionPercent,
                protocols,
                forceCrossProtocol,
            });
        }
        else {
            const amountOut = (0, src_1.parseAmount)(amountStr, tokenOut);
            swapRoutes = await router.route(amountOut, tokenIn, sdk_core_1.TradeType.EXACT_OUTPUT, recipient
                ? {
                    deadline: deadline || 100,
                    recipient,
                    slippageTolerance: new sdk_core_1.Percent(5, 10000),
                }
                : undefined, {
                blockNumber: this.blockNumber - 10,
                v3PoolSelection: {
                    topN,
                    topNTokenInOut,
                    topNSecondHop,
                    topNWithEachBaseToken,
                    topNWithBaseToken,
                    topNWithBaseTokenInSet,
                    topNDirectSwaps,
                },
                maxSwapsPerPath,
                minSplits,
                maxSplits,
                distributionPercent,
                protocols,
                forceCrossProtocol,
            });
        }
        if (!swapRoutes) {
            log.error(`Could not find route. ${debug ? '' : 'Run in debug mode for more info'}.`);
            return;
        }
        const { blockNumber, estimatedGasUsed, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, gasPriceWei, methodParameters, quote, quoteGasAdjusted, route: routeAmounts, } = swapRoutes;
        this.logSwapResults(routeAmounts, quote, quoteGasAdjusted, estimatedGasUsedQuoteToken, estimatedGasUsedUSD, methodParameters, blockNumber, estimatedGasUsed, gasPriceWei);
    }
}
exports.Quote = Quote;
Quote.description = 'Uniswap Smart Order Router CLI';
Quote.flags = Object.assign(Object.assign({}, base_command_1.BaseCommand.flags), { version: command_1.flags.version({ char: 'v' }), help: command_1.flags.help({ char: 'h' }), tokenIn: command_1.flags.string({ char: 'i', required: true }), tokenOut: command_1.flags.string({ char: 'o', required: true }), recipient: command_1.flags.string({ required: false }), amount: command_1.flags.string({ char: 'a', required: true }), exactIn: command_1.flags.boolean({ required: false }), exactOut: command_1.flags.boolean({ required: false }), protocols: command_1.flags.string({ required: false }), forceCrossProtocol: command_1.flags.boolean({ required: false, default: false }), deadline: command_1.flags.integer({ required: false }) });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicXVvdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi9jbGkvY29tbWFuZHMvcXVvdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsNENBQXVDO0FBQ3ZDLG9EQUErQztBQUMvQyxnREFBaUU7QUFDakUsb0RBQTRCO0FBQzVCLG1DQUFnQztBQUNoQyxvREFBdUI7QUFDdkIsbUNBTW1CO0FBQ25CLHdEQUF1RDtBQUN2RCxrREFBOEM7QUFFOUMsZ0JBQU0sQ0FBQyxNQUFNLEVBQUUsQ0FBQztBQUVoQixlQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxZQUFZLEVBQUUsQ0FBQztBQUNuQyxlQUFNLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQUMsZUFBTSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBRWxFLE1BQWEsS0FBTSxTQUFRLDBCQUFXO0lBa0JwQyxLQUFLLENBQUMsR0FBRztRQUNQLE1BQU0sRUFBRSxLQUFLLEVBQUUsR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sRUFDSixPQUFPLEVBQUUsVUFBVSxFQUNuQixRQUFRLEVBQUUsV0FBVyxFQUNyQixNQUFNLEVBQUUsU0FBUyxFQUNqQixPQUFPLEVBQ1AsUUFBUSxFQUNSLFNBQVMsRUFDVCxLQUFLLEVBQ0wsSUFBSSxFQUNKLGNBQWMsRUFDZCxhQUFhLEVBQ2IscUJBQXFCLEVBQ3JCLGlCQUFpQixFQUNqQixzQkFBc0IsRUFDdEIsZUFBZSxFQUNmLGVBQWUsRUFDZixTQUFTLEVBQ1QsU0FBUyxFQUNULG1CQUFtQixFQUNuQixPQUFPLEVBQUUsV0FBVyxFQUNwQixTQUFTLEVBQUUsWUFBWSxFQUN2QixrQkFBa0IsRUFDbEIsUUFBUSxHQUNULEdBQUcsS0FBSyxDQUFDO1FBRVYsSUFBSSxDQUFDLE9BQU8sSUFBSSxRQUFRLENBQUMsSUFBSSxD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