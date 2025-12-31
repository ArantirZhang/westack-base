-- ============================================
-- Memgraph Schema Constraints
--
-- Creates uniqueness constraints for ECS nodes
-- ============================================

-- Entity nodes - unique by ID
CREATE CONSTRAINT ON (e:Entity) ASSERT e.id IS UNIQUE;

-- ComponentType meta-nodes - unique by name
CREATE CONSTRAINT ON (ct:ComponentType) ASSERT ct.name IS UNIQUE;

-- RelationshipType meta-nodes - unique by name
CREATE CONSTRAINT ON (rt:RelationshipType) ASSERT rt.name IS UNIQUE;

-- Component nodes do not need uniqueness constraints
-- They are always attached to specific Entity nodes
