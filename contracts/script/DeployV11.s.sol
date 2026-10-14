// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RouterRegistry} from "../src/RouterRegistry.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {BespeakVaultFactory} from "../src/BespeakVaultFactory.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {TriggerType} from "../src/BespeakTypes.sol";

/// Deploys v1.1 beside the live v1 stack, adding the sell side.
///
/// Only three contracts are new, and that is a fact about the original design rather than a
/// shortcut. The vault was already multi-token and the adapter was already generic over
/// input and output, so direction turned out to live in exactly one line of the order
/// manager. What has to be redeployed is only what is immutably bound to a manager: the
/// manager itself, the vault factory, and the adapter.
///
/// Reused, not redeployed:
///   AssetRegistry           the twelve assets stay at the revision the 25 Sep run proved
///   RouterRegistry          the same allowlisted OKX and Uniswap addresses
///   AttestedSessionVerifier the same Tier 3 source and the same attestor key
///
/// Reusing the registry matters for evidence as much as for cost: a v1.1 order is gated on
/// the identical asset set, at the identical revision, as the fills already on chain. If
/// this script had deployed a fresh registry, every claim carried over from v1 would have
/// been about a different set of addresses wearing the same names.
///
/// v1 is deliberately left running and untouched. The 28 Sep fill's contracts remain the
/// evidenced deployment; nothing here migrates, pauses or repoints them.
contract DeployV11 is Script {
    function run() external {
        uint256 pk = vm.envUint("KEEPER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        address assetRegistry = vm.envAddress("BESPEAK_ASSET_REGISTRY");
        address routerRegistry = vm.envAddress("BESPEAK_ROUTER_REGISTRY");
        address conditionVerifier = vm.envAddress("BESPEAK_CONDITION_VERIFIER");

        console.log("chainid           ", block.chainid);
        console.log("deployer          ", deployer);
        console.log("balance           ", deployer.balance);
        console.log("reusing registry  ", assetRegistry);
        console.log("reusing routers   ", routerRegistry);
        console.log("reusing verifier  ", conditionVerifier);

        vm.startBroadcast(pk);

        BespeakOrderManager manager =
            new BespeakOrderManager(deployer, assetRegistry, routerRegistry);
        BespeakVaultFactory factory = new BespeakVaultFactory(address(manager));
        OkxExecutionAdapter adapter =
            new OkxExecutionAdapter(address(manager), routerRegistry);

        manager.setVaultFactory(address(factory));
        manager.setAdapter(address(adapter));
        manager.setConditionSource(TriggerType.NEXT_REGULAR_SESSION, conditionVerifier);
        manager.setConditionSource(TriggerType.WHEN_AVAILABLE, conditionVerifier);
        manager.setKeeper(deployer, true);

        // The same two issuer-supported stablecoins. On v1.1 this allowlist does double
        // duty: it is the set Bespeak will take payment in, and the set it will pay sell
        // proceeds out in.
        manager.setInputToken(0xB6CEceAB302E2E4948951eE7843FC24E92933061, true); // USDC
        manager.setInputToken(0x4ae46a509F6b1D9056937BA4500cb143933D2dc8, true); // USDG

        vm.stopBroadcast();

        console.log("BespeakOrderManager v1.1", address(manager));
        console.log("BespeakVaultFactory v1.1", address(factory));
        console.log("OkxExecutionAdapter v1.1", address(adapter));

        string memory json = string.concat(
            '{\n  "version": "1.1",',
            '\n  "chainId": ', vm.toString(block.chainid),
            ',\n  "deployer": "', vm.toString(deployer),
            '",\n  "assetRegistry": "', vm.toString(assetRegistry),
            '",\n  "routerRegistry": "', vm.toString(routerRegistry),
            '",\n  "conditionVerifier": "', vm.toString(conditionVerifier),
            '",\n  "orderManager": "', vm.toString(address(manager)),
            '",\n  "vaultFactory": "', vm.toString(address(factory)),
            '",\n  "executionAdapter": "', vm.toString(address(adapter)),
            '",\n  "note": "Sell side. Deployed beside v1; v1 remains live and is the deployment the 28 Sep fill was executed on."',
            '\n}\n'
        );
        vm.writeFile("./deployments/xlayer-v11.json", json);
    }
}
