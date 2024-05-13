import { TradeController } from "@spt-aki/controllers/TradeController";
import { ItemHelper } from "@spt-aki/helpers/ItemHelper";
import { ProfileHelper } from "@spt-aki/helpers/ProfileHelper";
import { TradeHelper } from "@spt-aki/helpers/TradeHelper";
import { IPmcData } from "@spt-aki/models/eft/common/IPmcData";
import { Item } from "@spt-aki/models/eft/common/tables/IItem";
import { IItemEventRouterResponse } from "@spt-aki/models/eft/itemEvent/IItemEventRouterResponse";
import { IProcessBaseTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBaseTradeRequestData";
import { IProcessSellTradeRequestData } from "@spt-aki/models/eft/trade/IProcessSellTradeRequestData";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { EventOutputHolder } from "@spt-aki/routers/EventOutputHolder";
import { ConfigServer } from "@spt-aki/servers/ConfigServer";
import { RagfairServer } from "@spt-aki/servers/RagfairServer";
import { LocalisationService } from "@spt-aki/services/LocalisationService";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { inject, injectable } from "tsyringe";

import * as baseJson from "../db/base.json";
import modInfo from "../package.json";
import modConfig from "../config/config.json";

import { BrokerPriceManager } from "./broker_price_manager";
import { VerboseLogger } from "./verbose_logger";
import { IProcessBuyTradeRequestData } from "@spt-aki/models/eft/trade/IProcessBuyTradeRequestData";
import { Money } from "@spt-aki/models/enums/Money";
import { Traders } from "@spt-aki/models/enums/Traders";
import { TraderHelper } from "@spt-aki/helpers/TraderHelper";
import { RagfairPriceService } from "@spt-aki/services/RagfairPriceService";
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { TimeUtil } from "@spt-aki/utils/TimeUtil";
import { RandomUtil } from "@spt-aki/utils/RandomUtil";
import { HashUtil } from "@spt-aki/utils/HashUtil";
import { MailSendService } from "@spt-aki/services/MailSendService";

@injectable()
export class BrokerTradeController extends TradeController {
    constructor(
        @inject("WinstonLogger") logger: ILogger,
        @inject("DatabaseServer") databaseServer: DatabaseServer,
        @inject("EventOutputHolder") eventOutputHolder: EventOutputHolder,
        @inject("TradeHelper") tradeHelper: TradeHelper,
        @inject("TimeUtil") timeUtil: TimeUtil,
        @inject("RandomUtil") randomUtil: RandomUtil,
        @inject("HashUtil") hashUtil: HashUtil,
        @inject("ItemHelper") itemHelper: ItemHelper,
        @inject("ProfileHelper") profileHelper: ProfileHelper,
        @inject("TraderHelper") traderHelper: TraderHelper,
        @inject("JsonUtil") jsonUtil: JsonUtil,
        @inject("RagfairServer") ragfairServer: RagfairServer,
        @inject("HttpResponseUtil") httpResponse: HttpResponseUtil,
        @inject("LocalisationService") localisationService: LocalisationService,
        @inject("RagfairPriceService") ragfairPriceService: RagfairPriceService,
        @inject("MailSendService") mailSendService: MailSendService,
        @inject("ConfigServer") configServer: ConfigServer
    ) {
        super(logger, databaseServer, eventOutputHolder, tradeHelper, timeUtil, randomUtil, hashUtil, itemHelper, profileHelper, traderHelper, jsonUtil, ragfairServer, httpResponse, localisationService, ragfairPriceService, mailSendService, configServer);
    }

    public override confirmTrading(pmcData: IPmcData, body: IProcessBaseTradeRequestData, sessionID: string): IItemEventRouterResponse {
        // Exceptions seem to be handled somewhere where this method is used.
        // And due to the way they are handled - only "error" is displayed instead of the actual error msg.
        // This sort of fixes it sometimes.     
        try {
            if (body.tid === baseJson._id) {
                const logPrefix = `[${modInfo.name} ${modInfo.version}]`;
                if (body.type === "buy_from_trader") {
                    // Redirect currency purchases to corresponding traders
                    const buyRequestData = body as IProcessBuyTradeRequestData;
                    const traderHelper = BrokerPriceManager.instance.container.resolve<TraderHelper>(TraderHelper.name);
                    const brokerAssort = traderHelper.getTraderAssortsByTraderId(BrokerPriceManager.brokerTraderId);
                    const brokerUsdItem = brokerAssort.items.find(item => item._tpl === Money.DOLLARS)._id;
                    const brokerEurItem = brokerAssort.items.find(item => item._tpl === Money.EUROS)._id;

                    if (buyRequestData.item_id === brokerUsdItem) {
                        buyRequestData.tid = Traders.PEACEKEEPER;
                        buyRequestData.item_id = traderHelper.getTraderAssortsByTraderId(Traders.PEACEKEEPER).items.find(item => item._tpl === Money.DOLLARS)._id;
                    }
                    if (buyRequestData.item_id === brokerEurItem) {
                        buyRequestData.tid = Traders.SKIER;
                        buyRequestData.item_id = traderHelper.getTraderAssortsByTraderId(Traders.SKIER).items.find(item => item._tpl === Money.EUROS)._id
                    }
                    // Let it skip to the super.confirmTrading call at the bottom.
                }
                if (body.type === "sell_to_trader") {
                    const priceManager = BrokerPriceManager.instance;
                    // Kind of an interesting way to pass DependencyContainer instance from mod.ts but will do.
                    // Not sure if simply importing container from "tsyringe" is good.
                    const container = priceManager.container;
                    const verboseLogger = new VerboseLogger(container);
                    const sellRequestBody = body as IProcessSellTradeRequestData;

                    // Logging. Shouldn't be executed during normal use, since it additionally searches for items in player inventory by id.
                    if (verboseLogger.isVerboseEnabled) {
                        verboseLogger.log(`${logPrefix} SELL REQUEST BODY DUMP: ${JSON.stringify(sellRequestBody)}`, LogTextColor.RED);
                        const requestInventoryItems = sellRequestBody.items.map(reqItem => priceManager.getItemFromInventoryById(reqItem.id, pmcData));
                        verboseLogger.log(`${logPrefix} REQUEST INVENTORY ITEMS DUMP: ${JSON.stringify(requestInventoryItems)}`, LogTextColor.YELLOW);
                    }

                    const responses: IItemEventRouterResponse[] = [];
                    const sellReqDataPerTrader = priceManager.processSellRequestDataForMostProfit(pmcData, sellRequestBody);

                    // traderId used for grouping, so may contain brokerTraderId(valid trader id) and brokerCurrencyExchangeId(not a valid trader id)
                    // prefer tReqData.requestBody.tid for actual valid trader id.
                    for (const traderId in sellReqDataPerTrader) {

                        const tReqData = sellReqDataPerTrader[traderId];
                        const tradeResponse = super.confirmTrading(pmcData, tReqData.requestBody, sessionID);

                        // Make sales sum increase unaffected by commission.
                        // commission is converted to trader currency(don't use commissionInRoubles)
                        if (!BrokerPriceManager.isBroker(traderId)) {
                            pmcData.TradersInfo[tReqData.requestBody.tid].salesSum += tReqData.commission;
                        }

                        // Logging section
                        if (tReqData.isFleaMarket) {
                            let profitMsg = `${logPrefix} ${tReqData.traderName}: Sold ${tReqData.fullItemCount} items. ` +
                                `Profit: ${BrokerPriceManager.getNumberWithSpaces(tReqData.totalProfit)} RUB (` +
                                `Price: ${BrokerPriceManager.getNumberWithSpaces(tReqData.totalPrice)} RUB | ` +
                                `Tax: ${BrokerPriceManager.getNumberWithSpaces(tReqData.totalTax)} RUB).`;
                            if (modConfig.profitCommissionPercentage > 0) {
                                profitMsg += ` Commission: ${tReqData.commissionInRoubles} RUB.`;
                            }
                            verboseLogger.explicitSuccess(profitMsg);
                        }
                        else {
                            const tCurrency = BrokerPriceManager.instance.tradersMetaData[traderId].currency;
                            let profitMsg =
                                `${logPrefix} ${tReqData.traderName}: Sold ${tReqData.fullItemCount} items. Profit ${BrokerPriceManager.getNumberWithSpaces(tReqData.totalProfitInRoubles)} RUB`;
                            if (tCurrency !== "RUB") {
                                profitMsg += ` (In ${tCurrency}: ${BrokerPriceManager.getNumberWithSpaces(tReqData.totalProfit)})`;
                            }
                            profitMsg += ".";
                            // no need for commission log when it's 0 (e.g. currency exhange)
                            if (modConfig.profitCommissionPercentage > 0 && tReqData.commissionInRoubles > 0) {
                                profitMsg += ` Commission: ${tReqData.commissionInRoubles} RUB`;
                                if (tCurrency !== "RUB") {
                                    profitMsg += ` (In ${tCurrency}: ${BrokerPriceManager.getNumberWithSpaces(tReqData.commission)})`;
                                }
                                profitMsg += ".";
                            }
                            verboseLogger.explicitSuccess(profitMsg);
                        }

                        // Items sold to Broker are sold with Flea Prices, here simulate other flea market things
                        if (tReqData.isFleaMarket) {
                            // Use total price, since the tax doesn't count towards flea rep.
                            // By default - you get 0.01 rep per 50 000 RUB sold. 

                            // 3.7.X Code
                            // const repGain = this.ragfairConfig.sell.reputation.gain;
                            // 3.8.X Code
                            const repGain = this.databaseServer.getTables().globals.config.RagFair.ratingIncreaseCount;

                            const ratingIncrease = tReqData.totalPrice * repGain;
                            pmcData.RagfairInfo.isRatingGrowing = true;
                            pmcData.RagfairInfo.rating += ratingIncrease;
                            verboseLogger.explicitSuccess(
                                `${logPrefix} ${tReqData.traderName}: Flea rep increased to ${pmcData.RagfairInfo.rating} (+${ratingIncrease})`
                            );

                            // Usually flea operations increase the salesSum of a hidden "ragfair" trader, it's simulated here
                            // I think it's probably unnecessary to show it in the logs since salesSum also includes your purchases from flea (tested).
                            pmcData.TradersInfo["ragfair"].salesSum += tReqData.totalPrice; // add to the sales sum for consistency
                        }
                        verboseLogger.log(`${logPrefix} ${tReqData.traderName} RESPONSE DUMP: ${JSON.stringify(tradeResponse)}`, LogTextColor.CYAN);
                        responses.push(tradeResponse);
                    }

                    // Apparently every single of these responses point to the same object
                    // which is updated with every transaction, so no manual merging is needed.
                    // Just take the last respons. For now I'll leave the array here, but will probably remove later.
                    const mergedResponse = responses[responses.length - 1];
                    verboseLogger.log(`${logPrefix} LAST RESPONSE DUMP: ${JSON.stringify(responses)}`, LogTextColor.YELLOW);

                    return mergedResponse;
                }
            }
            return super.confirmTrading(pmcData, body, sessionID);
        }
        catch (error) {
            this.logger.error(error);
            throw "error";
        }
    }

    /**
     * @deprecated
     * @param itemId 
     * @param pmcData 
     * @returns 
     */
    // Find item by it's id in inventory. If not found return undefined.
    private getItemFromInventoryById(itemId: string, pmcData: IPmcData): Item {
        return pmcData.Inventory.items.find(item => item._id === itemId);
    }

}