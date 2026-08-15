-- ============================================================
-- NexusGear PostgreSQL Schema
-- HT-304: NexusGear Checkout Backend
-- ============================================================

-- ============================================================
-- Products
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(255) NOT NULL,
    category    VARCHAR(100),
    base_price  NUMERIC(10,2) NOT NULL,
    description TEXT,
    stock       INTEGER NOT NULL DEFAULT 100
);

-- ============================================================
-- Orders
-- ============================================================

CREATE TABLE IF NOT EXISTS orders (
    id          SERIAL PRIMARY KEY,
    product_id  INTEGER REFERENCES products(id),
    quantity    INTEGER NOT NULL DEFAULT 1,
    unit_price  NUMERIC(10,2) NOT NULL,
    total       NUMERIC(10,2) NOT NULL,
    session_id  VARCHAR(255),
    status      VARCHAR(50) DEFAULT 'confirmed',
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Seed NexusGear Products
-- ============================================================

INSERT INTO products
    (name, category, base_price, description, stock)
VALUES
    (
        'Quantum Processor X1',
        'Computing',
        1299.00,
        'Next-gen 128-core AI processing unit',
        50
    ),
    (
        'Neural Link Headset',
        'Wearables',
        499.00,
        'Direct neural interface, 4ms latency',
        30
    ),
    (
        'HoloDisplay 8K',
        'Displays',
        2199.00,
        '32-inch holographic floating display',
        20
    ),
    (
        'CryoStorage 100TB',
        'Storage',
        799.00,
        'Superconducting cold storage array',
        45
    ),
    (
        'Photon GPU Cluster',
        'Computing',
        3499.00,
        'Light-based parallel compute cluster',
        15
    ),
    (
        'BioSync Smartwatch',
        'Wearables',
        349.00,
        'Real-time biometric sync + health AI',
        75
    ),
    (
        'Plasma Router Pro',
        'Networking',
        599.00,
        '1Tbps mesh networking node',
        40
    ),
    (
        'QuantumVault Encryptor',
        'Security',
        899.00,
        'Post-quantum encryption hardware key',
        35
    ),
    (
        'SynapseRAM 512GB',
        'Computing',
        1099.00,
        'Neuromorphic memory architecture',
        25
    ),
    (
        'Orbital Mesh Antenna',
        'Networking',
        449.00,
        'Low-latency satellite uplink hardware',
        60
    ),
    (
        'DynaFrame Exoskeleton',
        'Wearables',
        5999.00,
        'Lightweight carbon-fiber assist frame',
        10
    ),
    (
        'FluxCore Battery Pack',
        'Energy',
        299.00,
        '2MWh solid-state portable power cell',
        80
    );
