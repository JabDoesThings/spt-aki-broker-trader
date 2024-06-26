import { IGetBodyResponseData } from "@spt-aki/models/eft/httpResponse/IGetBodyResponseData";
import { DynamicRouterModService } from "@spt-aki/services/mod/dynamicRouter/DynamicRouterModService"
import { JsonUtil } from "@spt-aki/utils/JsonUtil";
import { DependencyContainer } from "tsyringe";
import { BrokerPriceManager } from "./broker_price_manager";

import modInfo from "../package.json";
import modCfg from "../config/config.json";
import { VerboseLogger } from "./verbose_logger";
import { HttpResponseUtil } from "@spt-aki/utils/HttpResponseUtil";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";

export class BrokerTraderRouter {
    private static container: DependencyContainer;
    private static router: DynamicRouterModService;
    private static http: HttpResponseUtil;
    private static jsonUtil: JsonUtil;

    private static logPrefix = `[${modInfo.name} ${modInfo.version}]`;

    public static registerRouter(container: DependencyContainer): void {
        this.container = container;
        this.router = container.resolve<DynamicRouterModService>(DynamicRouterModService.name);
        this.jsonUtil = container.resolve<JsonUtil>(JsonUtil.name);
        this.http = container.resolve<HttpResponseUtil>(HttpResponseUtil.name);

        const logger = new VerboseLogger(container);

        logger.explicitInfo(`${this.logPrefix} Registering BrokerTraderRouter...`)
        this.router.registerDynamicRouter(
            "BrokerTraderRouter",
            [
                { url: "/broker-trader/get/mod-config", action: () => this.respondGetModConfig() },
                { url: "/broker-trader/get/currency-base-prices", action: () => this.respondGetCurrencyBasePrices() },
                { url: "/broker-trader/get/supported-trader-ids", action: () => this.respondGetSupportedTraderIds() },
                { url: "/broker-trader/get/item-ragfair-price-table", action: () => this.respondGetItemRagfairPriceTable() },
                { url: "/broker-trader/post/sold-items-data", action: (url, info) => this.respondPostSoldItemsData(info) },
                { url: "/broker-trader/get/ragfair-sell-rep-gain", action: () => this.respondGetRagfairSellRepGain() }
            ],
            "broker-trader"
        )
    }

    private static respondGetModConfig(): IGetBodyResponseData<any> {
        return this.http.getBody({
            BuyRateDollar: modCfg.buyRateDollar,
            BuyRateEuro: modCfg.buyRateEuro,
            ProfitCommissionPercentage: modCfg.profitCommissionPercentage,
            UseRagfair: modCfg.useRagfair,
            RagfairIgnoreAttachments: modCfg.ragfairIgnoreAttachments,
            RagfairIgnoreFoundInRaid: modCfg.ragfairIgnoreFoundInRaid,
            RagfairIgnorePlayerLevel: modCfg.ragfairIgnorePlayerLevel,
            TradersIgnoreUnlockedStatus: modCfg.tradersIgnoreUnlockedStatus,
            UseNotifications: modCfg.useNotifications,
            NotificationsLongerDuration: modCfg.notificationsLongerDuration,
            UseClientPlugin: modCfg.useClientPlugin ?? true
        });
    }

    private static respondGetCurrencyBasePrices(): IGetBodyResponseData<Record<string, number>> {

        return this.http.getBody<Record<string, number>>(BrokerPriceManager.instance.currencyBasePrices);
    }

    private static respondGetSupportedTraderIds(): IGetBodyResponseData<string[]> {
        return this.http.getBody<string[]>(BrokerPriceManager.instance.supportedTraders);
    }

    private static respondGetItemRagfairPriceTable(): IGetBodyResponseData<Record<string, number>> {
        return this.http.getBody<Record<string, number>>(BrokerPriceManager.instance.itemRagfairPriceTable);
    }

    private static respondPostSoldItemsData(info: any): IGetBodyResponseData<string> {
        BrokerPriceManager.instance.setClientBrokerPriceData(info);
        return this.http.emptyResponse(); // Response is not really processed in the client in any way.
    }

    private static respondGetRagfairSellRepGain(): IGetBodyResponseData<number> {
        // SPT 3.7.X
        // const configServer = this.container.resolve<ConfigServer>(ConfigServer.name);
        // const ragfairConfig: IRagfairConfig = configServer.getConfig(ConfigTypes.RAGFAIR);
        // return this.http.getBody<number>(ragfairConfig.sell.reputation.gain);

        // SPT 3.8.X
        const databaseServer = this.container.resolve<DatabaseServer>(DatabaseServer.name);
        return this.http.getBody<number>(databaseServer.getTables().globals.config.RagFair.ratingIncreaseCount);
    }
}