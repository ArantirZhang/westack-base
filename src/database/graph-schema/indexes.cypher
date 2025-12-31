-- ============================================
-- Memgraph Schema Indexes
--
-- Creates indexes for frequently queried properties
-- ============================================

-- Entity nodes - index on ID for fast lookups
CREATE INDEX ON :Entity(id);

-- ComponentType meta-nodes - index on name and isBrickSchema
CREATE INDEX ON :ComponentType(name);
CREATE INDEX ON :ComponentType(isBrickSchema);

-- RelationshipType meta-nodes - index on name and isBrickSchema
CREATE INDEX ON :RelationshipType(name);
CREATE INDEX ON :RelationshipType(isBrickSchema);

-- Component nodes - index on type for filtering
CREATE INDEX ON :Component(type);
