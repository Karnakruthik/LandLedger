// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Stores public parcel commitments and owner-authorized changes of title.
contract LandRegistry {
    address public immutable administrator;
    struct Record { address owner; bytes32 documentHash; address proposedOwner; }
    struct Change { address previousOwner; address newOwner; uint64 timestamp; }
    mapping(string => Record) public parcels;
    mapping(string => Change[]) private changes;
    event Registered(string propertyId, address indexed owner, bytes32 documentHash);
    event TransferInitiated(string propertyId, address indexed previousOwner, address indexed newOwner);
    event TransferApproved(string propertyId, address indexed previousOwner, address indexed newOwner);
    event TransferRejected(string propertyId, address indexed previousOwner, address indexed newOwner);

    constructor(address admin) { require(admin != address(0), "Missing administrator"); administrator = admin; }
    modifier onlyAdmin() { require(msg.sender == administrator, "Administrator required"); _; }

    function registerProperty(string calldata id, address owner, bytes32 digest) external onlyAdmin {
        require(bytes(id).length > 0 && bytes(id).length <= 64 && owner != address(0) && digest != 0, "Invalid record");
        require(parcels[id].owner == address(0), "Already registered");
        parcels[id] = Record(owner, digest, address(0));
        changes[id].push(Change(address(0), owner, uint64(block.timestamp)));
        emit Registered(id, owner, digest);
    }
    function verifyOwnership(string calldata id, address owner) external view returns (bool) {
        return owner != address(0) && parcels[id].owner == owner;
    }
    function initiateTransfer(string calldata id, address buyer) external {
        Record storage p = parcels[id];
        require(p.owner == msg.sender, "Owner required");
        require(buyer != address(0) && buyer != msg.sender && p.proposedOwner == address(0), "Invalid proposal");
        p.proposedOwner = buyer;
        emit TransferInitiated(id, msg.sender, buyer);
    }
    function reviewTransfer(string calldata id, address expectedBuyer, bool approve) external onlyAdmin {
        Record storage p = parcels[id];
        require(expectedBuyer != address(0) && p.proposedOwner == expectedBuyer, "Proposal changed");
        address previous = p.owner;
        p.proposedOwner = address(0);
        if (approve) {
            p.owner = expectedBuyer;
            changes[id].push(Change(previous, expectedBuyer, uint64(block.timestamp)));
            emit TransferApproved(id, previous, expectedBuyer);
        } else { emit TransferRejected(id, previous, expectedBuyer); }
    }
    function historyLength(string calldata id) external view returns (uint256) { return changes[id].length; }
    function ownershipChange(string calldata id, uint256 index) external view returns (Change memory) { return changes[id][index]; }
}
