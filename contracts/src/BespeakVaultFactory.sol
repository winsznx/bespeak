// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {BespeakVault} from "./BespeakVault.sol";

/// @title BespeakVaultFactory
/// @notice Deploys exactly one canonical vault per user address.
/// @dev CREATE2 with the owner as salt makes the vault address derivable off-chain before
/// it exists, so the UI can show a user their vault address and let them pre-fund it.
contract BespeakVaultFactory {
    address public immutable orderManager;

    mapping(address owner => address vault) public vaultOf;

    event VaultCreated(address indexed owner, address indexed vault);

    error VaultExists(address owner, address vault);

    constructor(address _orderManager) {
        orderManager = _orderManager;
    }

    function createVault(address owner) external returns (address vault) {
        address existing = vaultOf[owner];
        if (existing != address(0)) revert VaultExists(owner, existing);

        vault = address(new BespeakVault{salt: bytes32(uint256(uint160(owner)))}(owner, orderManager));
        vaultOf[owner] = vault;
        emit VaultCreated(owner, vault);
    }

    /// @notice Idempotent: returns the existing vault or creates it.
    function ensureVault(address owner) external returns (address vault) {
        vault = vaultOf[owner];
        if (vault != address(0)) return vault;
        vault = address(new BespeakVault{salt: bytes32(uint256(uint160(owner)))}(owner, orderManager));
        vaultOf[owner] = vault;
        emit VaultCreated(owner, vault);
    }

    /// @notice The address `owner`'s vault will have, whether or not it is deployed yet.
    function predictVault(address owner) external view returns (address) {
        bytes32 initHash = keccak256(
            abi.encodePacked(type(BespeakVault).creationCode, abi.encode(owner, orderManager))
        );
        return address(
            uint160(
                uint256(
                    keccak256(
                        abi.encodePacked(
                            bytes1(0xff), address(this), bytes32(uint256(uint160(owner))), initHash
                        )
                    )
                )
            )
        );
    }
}
