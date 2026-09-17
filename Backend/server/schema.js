const { executeSql, getPool } = require('./db');

/**
 * Runs raw DDL directly against the pool (bypassing executeSql's @param
 * rewriting/row-recasing, which DDL statements don't need).
 */
async function runDDL(sqlText) {
    const pool = getPool();
    await pool.query(sqlText);
}

async function ensureSchema() {
    // --------------------------------------------------------
    // Schema + a GETDATE() shim so the many "GETDATE()" calls
    // sprinkled through the app's query text keep working as-is.
    // --------------------------------------------------------

    await runDDL(`CREATE SCHEMA IF NOT EXISTS dbo;`);

    await runDDL(`
        CREATE OR REPLACE FUNCTION public.getdate()
        RETURNS TIMESTAMP AS $$
            SELECT NOW()::timestamp;
        $$ LANGUAGE sql STABLE;
    `);

    // --------------------------------------------------------
    // Tables (all idempotent — safe to run on every startup)
    // --------------------------------------------------------

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.Users (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            Name VARCHAR(100) NOT NULL,
            Email VARCHAR(255) UNIQUE NOT NULL,
            Phone VARCHAR(20),
            PasswordHash VARCHAR(255) NOT NULL,
            Role VARCHAR(20) NOT NULL CHECK (Role IN ('User', 'Owner', 'Both')),
            AvatarUrl VARCHAR(500),
            Address VARCHAR(500),
            Bio VARCHAR(1000),
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.Flats (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            OwnerId INT NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,

            Title VARCHAR(200) NOT NULL,
            Description TEXT,

            Purpose VARCHAR(20) NOT NULL
                CHECK (Purpose IN ('Rent', 'Sale', 'Rent & Sale')),

            PropertyType VARCHAR(50) NOT NULL,
            Price DECIMAL(18,2) NOT NULL,
            SecurityDeposit DECIMAL(18,2),

            RentPeriod VARCHAR(20)
                CHECK (RentPeriod IN ('Monthly', 'Yearly', 'Negotiable')),

            -- Property summary
            ConstructionStatus VARCHAR(30)
                CHECK (ConstructionStatus IN ('Ready', 'Under Construction')),
            TransactionType VARCHAR(20)
                CHECK (TransactionType IN ('New', 'Resale')),
            Facing VARCHAR(20)
                CHECK (Facing IN ('North', 'South', 'East', 'West', 'North-East', 'North-West', 'South-East', 'South-West')),
            FloorAvailableOn VARCHAR(50),

            Bedrooms INT,
            Bathrooms INT,
            Balconies INT DEFAULT 0,
            LivingRooms INT,
            DiningRooms INT,
            Kitchen INT,
            ServantRooms INT,
            StoreRooms INT,

            Area DECIMAL(10,2),

            AreaUnit VARCHAR(10)
                CHECK (AreaUnit IN ('sq ft', 'sq m', 'katha', 'decimal')),

            LandArea DECIMAL(12,2),
            LandAreaUnit VARCHAR(10)
                CHECK (LandAreaUnit IN ('sq ft', 'sq m', 'katha', 'decimal')),

            Floor INT,
            TotalFloors INT,

            Furnished VARCHAR(20)
                CHECK (Furnished IN ('Unfurnished', 'Semi-furnished', 'Fully furnished')),

            -- Parking is a count (number of spaces), not a flag.
            Parking INT DEFAULT 0,
            CoveredParking INT DEFAULT 0,

            -- Amenities — kept as SMALLINT (0/1), not BOOLEAN, to match the
            -- app's existing "= 1" / "= 0" query style.
            Lift SMALLINT DEFAULT 0,
            Security SMALLINT DEFAULT 0,
            CCTV SMALLINT DEFAULT 0,
            Guard SMALLINT DEFAULT 0,
            Generator SMALLINT DEFAULT 0,
            Water SMALLINT DEFAULT 0,
            Gas SMALLINT DEFAULT 0,
            Electricity SMALLINT DEFAULT 0,
            Internet SMALLINT DEFAULT 0,
            CableTV SMALLINT DEFAULT 0,
            AirConditioning SMALLINT DEFAULT 0,
            Heating SMALLINT DEFAULT 0,
            SwimmingPool SMALLINT DEFAULT 0,
            Gym SMALLINT DEFAULT 0,
            CommunityHall SMALLINT DEFAULT 0,
            Rooftop SMALLINT DEFAULT 0,
            Garden SMALLINT DEFAULT 0,
            Playground SMALLINT DEFAULT 0,
            PetFriendly SMALLINT DEFAULT 0,
            Laundry SMALLINT DEFAULT 0,
            MosquePrayerRoom SMALLINT DEFAULT 0,
            FireExit SMALLINT DEFAULT 0,
            WASAConnection SMALLINT DEFAULT 0,
            SelfWaterSupply SMALLINT DEFAULT 0,
            HotWater SMALLINT DEFAULT 0,
            CylinderGas SMALLINT DEFAULT 0,
            TelephoneLine SMALLINT DEFAULT 0,
            Intercom SMALLINT DEFAULT 0,
            WifiConnectivity SMALLINT DEFAULT 0,
            SecurityAlarmSystem SMALLINT DEFAULT 0,
            ElectronicSecurity SMALLINT DEFAULT 0,
            SolarPanels SMALLINT DEFAULT 0,
            GuestParking SMALLINT DEFAULT 0,
            ServantQuarter SMALLINT DEFAULT 0,
            ServantToilet SMALLINT DEFAULT 0,
            FireProtection SMALLINT DEFAULT 0,
            DepartmentalStore SMALLINT DEFAULT 0,

            Address VARCHAR(500),
            AreaName VARCHAR(200),
            City VARCHAR(100),
            District VARCHAR(100),

            Latitude DECIMAL(10,8),
            Longitude DECIMAL(11,8),

            IsActive SMALLINT DEFAULT 1,

            AvailabilityStatus VARCHAR(20) NOT NULL DEFAULT 'Available'
                CHECK (AvailabilityStatus IN ('Available', 'Rented', 'Sold', 'Hidden', 'Expired')),

            CreatedAt TIMESTAMP DEFAULT NOW(),
            UpdatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.FlatMedia (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            FlatId INT NOT NULL REFERENCES dbo.Flats(Id) ON DELETE CASCADE,
            Url VARCHAR(500) NOT NULL,
            MediaType VARCHAR(10) NOT NULL CHECK (MediaType IN ('image', 'video')),
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.Requests (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            FlatId INT NOT NULL REFERENCES dbo.Flats(Id) ON DELETE CASCADE,
            -- No ON DELETE CASCADE here (mirrors the original SQL Server
            -- schema, which avoided a second cascade path through Users).
            UserId INT NOT NULL REFERENCES dbo.Users(Id),

            Type VARCHAR(20) NOT NULL CHECK (Type IN ('Rent', 'Buy', 'Inquiry')),
            Message TEXT,
            MoveInDate DATE,

            Status VARCHAR(20) DEFAULT 'Pending'
                CHECK (Status IN ('Pending', 'Contacted', 'Approved', 'Rejected', 'Completed')),

            CreatedAt TIMESTAMP DEFAULT NOW(),
            UpdatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.Favorites (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            UserId INT NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,
            FlatId INT NOT NULL REFERENCES dbo.Flats(Id) ON DELETE CASCADE,
            CreatedAt TIMESTAMP DEFAULT NOW(),
            UNIQUE (UserId, FlatId)
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.ChatConversations (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            FlatId INT NOT NULL REFERENCES dbo.Flats(Id) ON DELETE CASCADE,
            UserId INT NOT NULL REFERENCES dbo.Users(Id),
            OwnerId INT NOT NULL REFERENCES dbo.Users(Id),
            CreatedAt TIMESTAMP DEFAULT NOW(),
            UpdatedAt TIMESTAMP DEFAULT NOW(),
            CONSTRAINT UQ_ChatConversations_FlatUserOwner UNIQUE (FlatId, UserId, OwnerId)
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.ChatMessages (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            ConversationId INT NOT NULL REFERENCES dbo.ChatConversations(Id) ON DELETE CASCADE,
            SenderId INT NOT NULL REFERENCES dbo.Users(Id),
            MessageText VARCHAR(5000) NOT NULL,
            IsRead SMALLINT NOT NULL DEFAULT 0,
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    // Forgot-password OTP codes. A brand-new, standalone table — adding it
    // never touches Users or any other existing table/data.
    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.PasswordResets (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            UserId INT NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,
            CodeHash VARCHAR(255) NOT NULL,
            ExpiresAt TIMESTAMP NOT NULL,
            Attempts INT NOT NULL DEFAULT 0,
            Used SMALLINT NOT NULL DEFAULT 0,
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.Notifications (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            UserId INT NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,
            Type VARCHAR(50) NOT NULL,
            Title VARCHAR(200) NOT NULL,
            Message VARCHAR(1000),
            Link VARCHAR(500),
            IsRead SMALLINT NOT NULL DEFAULT 0,
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`
        CREATE TABLE IF NOT EXISTS dbo.PropertyReports (
            Id INT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
            FlatId INT NOT NULL REFERENCES dbo.Flats(Id) ON DELETE CASCADE,
            ReporterId INT NOT NULL REFERENCES dbo.Users(Id) ON DELETE CASCADE,
            Reason VARCHAR(100) NOT NULL,
            Details VARCHAR(2000),
            Status VARCHAR(20) NOT NULL DEFAULT 'Open' CHECK (Status IN ('Open','Reviewed','Resolved','Dismissed')),
            CreatedAt TIMESTAMP DEFAULT NOW()
        );
    `);

    await runDDL(`ALTER TABLE dbo.Flats ADD COLUMN IF NOT EXISTS ViewCount INT NOT NULL DEFAULT 0;`);
    await runDDL(`ALTER TABLE dbo.Flats DROP CONSTRAINT IF EXISTS flats_availabilitystatus_check;`);
    await runDDL(`ALTER TABLE dbo.Flats ADD CONSTRAINT flats_availabilitystatus_check CHECK (AvailabilityStatus IN ('Available','Rented','Sold','Hidden','Expired'));`);
    await runDDL(`ALTER TABLE dbo.Users DROP CONSTRAINT IF EXISTS users_role_check;`);
    await runDDL(`ALTER TABLE dbo.Users ADD CONSTRAINT users_role_check CHECK (Role IN ('User','Owner','Both'));`);

    // --------------------------------------------------------
    // Indexes
    // --------------------------------------------------------

    const indexes = [
        `CREATE INDEX IF NOT EXISTS IX_Users_Email ON dbo.Users(Email);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_OwnerId ON dbo.Flats(OwnerId);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_City ON dbo.Flats(City);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_Purpose ON dbo.Flats(Purpose);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_PropertyType ON dbo.Flats(PropertyType);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_Price ON dbo.Flats(Price);`,
        `CREATE INDEX IF NOT EXISTS IX_Requests_FlatId ON dbo.Requests(FlatId);`,
        `CREATE INDEX IF NOT EXISTS IX_Requests_UserId ON dbo.Requests(UserId);`,
        `CREATE INDEX IF NOT EXISTS IX_FlatMedia_FlatId ON dbo.FlatMedia(FlatId);`,
        `CREATE INDEX IF NOT EXISTS IX_Favorites_UserId ON dbo.Favorites(UserId);`,
        `CREATE INDEX IF NOT EXISTS IX_Favorites_FlatId ON dbo.Favorites(FlatId);`,
        `CREATE INDEX IF NOT EXISTS IX_ChatConversations_UserId ON dbo.ChatConversations(UserId);`,
        `CREATE INDEX IF NOT EXISTS IX_ChatConversations_OwnerId ON dbo.ChatConversations(OwnerId);`,
        `CREATE INDEX IF NOT EXISTS IX_ChatConversations_FlatId ON dbo.ChatConversations(FlatId);`,
        `CREATE INDEX IF NOT EXISTS IX_ChatMessages_ConversationId_CreatedAt ON dbo.ChatMessages(ConversationId, CreatedAt, Id);`,
        `CREATE INDEX IF NOT EXISTS IX_ChatMessages_SenderId ON dbo.ChatMessages(SenderId);`,
        `CREATE INDEX IF NOT EXISTS IX_PasswordResets_UserId ON dbo.PasswordResets(UserId);`,
        `CREATE INDEX IF NOT EXISTS IX_PasswordResets_ExpiresAt ON dbo.PasswordResets(ExpiresAt);`,
        `CREATE INDEX IF NOT EXISTS IX_Notifications_UserId_IsRead ON dbo.Notifications(UserId, IsRead, CreatedAt DESC);`,
        `CREATE INDEX IF NOT EXISTS IX_PropertyReports_FlatId ON dbo.PropertyReports(FlatId);`,
        `CREATE INDEX IF NOT EXISTS IX_Flats_IsActive_Status_CreatedAt ON dbo.Flats(IsActive, AvailabilityStatus, CreatedAt DESC);`
    ];

    for (const statement of indexes) {
        await runDDL(statement);
    }

    // --------------------------------------------------------
    // Additive repairs (kept from the original verifier, rewritten
    // for Postgres — idempotent, safe to run every startup).
    // --------------------------------------------------------

    await runDDL(`
        ALTER TABLE dbo.Flats
        ADD COLUMN IF NOT EXISTS AvailabilityStatus VARCHAR(20) NOT NULL DEFAULT 'Available';
    `);

    await runDDL(`
        UPDATE dbo.Flats
        SET AvailabilityStatus = 'Available'
        WHERE AvailabilityStatus IS NULL
           OR TRIM(AvailabilityStatus) = ''
           OR AvailabilityStatus NOT IN ('Available', 'Rented', 'Sold', 'Hidden', 'Expired');
    `);

    const verify = await executeSql(`SELECT COUNT(*) AS FlatCount FROM dbo.Flats;`);
    const flatCount = verify.length ? Number(verify[0].FlatCount ?? verify[0].flatcount ?? verify[0].count ?? 0) : 0;

    console.log(`✓ FlatMate schema verified (${flatCount} properties).`);
}

module.exports = { ensureSchema };
