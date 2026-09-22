// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {RouterRegistry} from "../src/RouterRegistry.sol";
import {BespeakOrderManager} from "../src/BespeakOrderManager.sol";
import {BespeakVaultFactory} from "../src/BespeakVaultFactory.sol";
import {OkxExecutionAdapter} from "../src/OkxExecutionAdapter.sol";
import {AttestedSessionVerifier} from "../src/AttestedSessionVerifier.sol";
import {TriggerType} from "../src/BespeakTypes.sol";

/// Deploys the full Bespeak stack to X Layer and wires it.
///
/// Deliberately does NOT register any asset or any router. Assets are promoted only by the
/// registry sync, which verifies each one on chain first, and routers are allowlisted only
/// from addresses the live OKX API actually returned. Baking either into the deploy script
/// would mean shipping an address nobody checked.
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("KEEPER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address attestor = vm.envOr("ATTESTOR_ADDRESS", deployer);

        console.log("chainid ", block.chainid);
        console.log("deployer", deployer);
        console.log("balance ", deployer.balance);

        vm.startBroadcast(pk);

        AssetRegistry assetRegistry = new AssetRegistry(deployer);
        RouterRegistry routerRegistry = new RouterRegistry(deployer);

        BespeakOrderManager manager =
            new BespeakOrderManager(deployer, address(assetRegistry), address(routerRegistry));

        BespeakVaultFactory factory = new BespeakVaultFactory(address(manager));
        OkxExecutionAdapter adapter = new OkxExecutionAdapter(address(manager), address(routerRegistry));

        // 60s freshness matches the PRD's condition-report default.
        AttestedSessionVerifier session = new AttestedSessionVerifier(
            deployer, keccak256("xstocks.fi/api/v2/public/assets"), 60
        );

        manager.setVaultFactory(address(factory));
        manager.setAdapter(address(adapter));
        manager.setConditionSource(TriggerType.NEXT_REGULAR_SESSION, address(session));
        manager.setConditionSource(TriggerType.WHEN_AVAILABLE, address(session));
        manager.setKeeper(deployer, true);
        session.setAttestor(attestor, true);

        // Issuer-supported stablecoins for xStocks on X Layer, both confirmed on chain.
        manager.setInputToken(0xB6CEceAB302E2E4948951eE7843FC24E92933061, true); // USDC
        manager.setInputToken(0x4ae46a509F6b1D9056937BA4500cb143933D2dc8, true); // USDG

        vm.stopBroadcast();

        console.log("AssetRegistry          ", address(assetRegistry));
        console.log("RouterRegistry         ", address(routerRegistry));
        console.log("BespeakOrderManager    ", address(manager));
        console.log("BespeakVaultFactory    ", address(factory));
        console.log("OkxExecutionAdapter    ", address(adapter));
        console.log("AttestedSessionVerifier", address(session));

        string memory json = string.concat(
            '{\n  "chainId": ', vm.toString(block.chainid),
            ',\n  "deployer": "', vm.toString(deployer),
            '",\n  "assetRegistry": "', vm.toString(address(assetRegistry)),
            '",\n  "routerRegistry": "', vm.toString(address(routerRegistry)),
            '",\n  "orderManager": "', vm.toString(address(manager)),
            '",\n  "vaultFactory": "', vm.toString(address(factory)),
            '",\n  "executionAdapter": "', vm.toString(address(adapter)),
            '",\n  "conditionVerifier": "', vm.toString(address(session)),
            '"\n}\n'
        );
        vm.writeFile("./deployments/xlayer.json", json);
    }
}
