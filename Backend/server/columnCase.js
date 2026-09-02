/**
 * Postgres folds every unquoted SQL identifier to lowercase. This app's
 * entire codebase (every controller, every frontend script) was written
 * expecting PascalCase result keys (row.Id, row.Title, row.AvatarUrl...),
 * matching how SQL Server returns them.
 *
 * Rather than touch hundreds of property accesses across the whole app,
 * executeSql() in db.js re-cases every returned row using this single
 * lookup table. Add an entry here any time a NEW column or SQL alias is
 * introduced that isn't already lowercase.
 */

const CANONICAL_COLUMNS = [
    // Users
    'Id', 'Name', 'Email', 'Phone', 'PasswordHash', 'Role', 'AvatarUrl',
    'Address', 'Bio', 'CreatedAt',

    // Flats
    'OwnerId', 'Title', 'Description', 'Purpose', 'PropertyType', 'Price',
    'SecurityDeposit', 'RentPeriod',
    'ConstructionStatus', 'TransactionType', 'Facing', 'FloorAvailableOn',
    'Bedrooms', 'Bathrooms', 'Balconies', 'LivingRooms', 'DiningRooms',
    'Kitchen', 'ServantRooms', 'StoreRooms', 'Area', 'AreaUnit',
    'LandArea', 'LandAreaUnit', 'Floor',
    'TotalFloors', 'Furnished',
    'Parking', 'CoveredParking', 'Lift', 'Security', 'CCTV',
    'Guard', 'Generator', 'Water', 'Gas', 'Electricity', 'Internet',
    'CableTV', 'AirConditioning', 'Heating', 'SwimmingPool', 'Gym',
    'CommunityHall', 'Rooftop', 'Garden', 'Playground', 'PetFriendly',
    'Laundry', 'MosquePrayerRoom', 'FireExit', 'WASAConnection',
    'SelfWaterSupply', 'HotWater', 'CylinderGas', 'TelephoneLine',
    'Intercom', 'WifiConnectivity', 'SecurityAlarmSystem',
    'ElectronicSecurity', 'SolarPanels', 'GuestParking', 'ServantQuarter',
    'ServantToilet', 'FireProtection', 'DepartmentalStore',
    'AreaName', 'City', 'District', 'Latitude', 'Longitude', 'IsActive',
    'AvailabilityStatus', 'UpdatedAt',

    // FlatMedia
    'FlatId', 'Url', 'MediaType',

    // Requests
    'UserId', 'Type', 'Message', 'MoveInDate', 'Status',

    // Favorites
    'FavoriteId', 'FavoritedAt',

    // ChatConversations / ChatMessages
    'ConversationId', 'SenderId', 'MessageText', 'IsRead',

    // PasswordResets
    'CodeHash', 'ExpiresAt', 'Attempts', 'Used',

    // Common SELECT ... AS aliases used across controllers/routes
    'FlatTitle', 'FlatDescription',
    'OwnerName', 'OwnerEmail', 'OwnerPhone', 'OwnerAvatar',
    'UserName', 'UserEmail', 'UserPhone', 'UserAvatar',
    'SenderName', 'SenderEmail', 'SenderPhone', 'SenderAvatar',
    'LastMessage', 'LastMessageAt', 'LastMessageSenderId', 'UnreadCount',
    'mainImage'
];

/** lowercase -> canonical PascalCase */
const COLUMN_CASE_MAP = new Map(
    CANONICAL_COLUMNS.map(name => [name.toLowerCase(), name])
);

/**
 * Re-cases a single row's keys. Any key not found in the map (e.g. an
 * aggregate like COUNT(*) with no alias, which Postgres names "count")
 * is left as Postgres returned it.
 */
function recaseRow(row) {
    const result = {};
    for (const key of Object.keys(row)) {
        const canonical = COLUMN_CASE_MAP.get(key) || key;
        result[canonical] = row[key];
    }
    return result;
}

function recaseRows(rows) {
    return rows.map(recaseRow);
}

module.exports = { COLUMN_CASE_MAP, recaseRow, recaseRows };
