﻿using Aki.Common.Http;
using BepInEx;
using BepInEx.Logging;
using BrokerPatch;
using BrokerTraderPlugin.Reflections;
using BrokerTraderPlugin.Reflections.Extensions;
using System;
using System.Runtime.CompilerServices;

namespace BrokerTraderPlugin
{

    //    [BepInPlugin(PluginInfo.PLUGIN_GUID, PluginInfo.PLUGIN_NAME, PluginInfo.PLUGIN_VERSION)]
    [BepInPlugin("broker-trader-id", "BrokerTraderPlugin", "1.3.3")]
    public class TheBrokerPlugin : BaseUnityPlugin
    {
        public static ManualLogSource GlobalLogger;
        private void Awake()
        {
            // Plugin startup logic
            Logger.LogInfo($"Plugin broker-trader-id is loaded!");
            GlobalLogger = Logger;
            ReflectionHelper.Logger = Logger;
            try
            {
                // Initialize PriceManager as early as possible, to let it collect data it needs from the server.
                RuntimeHelpers.RunClassConstructor(typeof(PriceManager).TypeHandle);
                if (PriceManager.ModConfig.UseClientPlugin)
                {
                    // Pre-init static refeclion constructors to let them find their Types.
                    RuntimeHelpers.RunClassConstructor(typeof(CurrencyHelper).TypeHandle);
                    RuntimeHelpers.RunClassConstructor(typeof(ItemPrice).TypeHandle);
                    RuntimeHelpers.RunClassConstructor(typeof(PriceHelper).TypeHandle);
                    RuntimeHelpers.RunClassConstructor(typeof(ItemHelper).TypeHandle);

                    if (PriceManager.ModConfig.UseRagfair)
                    {
                        new PatchRefreshRagfairOnTraderScreenShow().Enable(); // Refresh ragfair prices before opening Broker trader screen
                    }
                    new PatchSendDataOnDealButtonPress().Enable(); // Send client item data to server when user presses "DEAL!".
                    new PatchEquivalentSum().Enable(); // Selling money equivalent(total sell profit) patch.
                    new PatchGetUserItemPrice().Enable(); // Individual item price display.
                }
            }
            catch (Exception ex)
            {
                Logger.LogError($"Error3! broker-trader-id threw an exception while loading, perhaps due to version incompatibility. Exception message: {ex.Message}");
                throw ex;
            }
        }
    }
}
