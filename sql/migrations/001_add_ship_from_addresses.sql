-- Migration: Add ship_from_addresses table
-- Created: 2025-12-01
-- Description: Adds dynamic ship-from address management

BEGIN;

-- Create ship_from_addresses table
CREATE TABLE IF NOT EXISTS ship_from_addresses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  company TEXT,
  street1 TEXT NOT NULL,
  street2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  country TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ship_from_addresses_user_id ON ship_from_addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_ship_from_addresses_is_default ON ship_from_addresses(is_default);

-- Add ship_from_address_id column to shipments table
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS ship_from_address_id UUID REFERENCES ship_from_addresses(id) ON DELETE SET NULL;

-- Add updated_at trigger for ship_from_addresses
DROP TRIGGER IF EXISTS update_ship_from_addresses_updated_at ON ship_from_addresses;
CREATE TRIGGER update_ship_from_addresses_updated_at
  BEFORE UPDATE ON ship_from_addresses
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert default ship-from addresses for Vegas and LA
INSERT INTO ship_from_addresses (user_id, name, company, street1, street2, city, state, zip, country, phone, email, is_default)
VALUES 
  -- Las Vegas locations
  ('00000000-0000-0000-0000-000000000000', 'Las Vegas North Fulfillment Center', 'Unified Shipping', '4550 N Lamb Blvd', 'Suite 100', 'Las Vegas', 'NV', '89115', 'US', '702-555-0101', 'vegas-north@unified.local', true),
  ('00000000-0000-0000-0000-000000000000', 'Las Vegas South Warehouse', 'Unified Shipping', '6625 S Valley View Blvd', 'Building A', 'Las Vegas', 'NV', '89118', 'US', '702-555-0102', 'vegas-south@unified.local', false),
  ('00000000-0000-0000-0000-000000000000', 'Henderson Distribution Center', 'Unified Shipping', '2500 Wigwam Pkwy', '', 'Henderson', 'NV', '89074', 'US', '702-555-0103', 'henderson@unified.local', false),
  
  -- Los Angeles locations
  ('00000000-0000-0000-0000-000000000000', 'Los Angeles Downtown Warehouse', 'Unified Shipping', '1855 Industrial St', 'Suite 200', 'Los Angeles', 'CA', '90021', 'US', '213-555-0201', 'la-downtown@unified.local', false),
  ('00000000-0000-0000-0000-000000000000', 'Vernon Fulfillment Center', 'Unified Shipping', '3750 Bandini Blvd', '', 'Vernon', 'CA', '90058', 'US', '323-555-0202', 'vernon@unified.local', false),
  ('00000000-0000-0000-0000-000000000000', 'Commerce Distribution Hub', 'Unified Shipping', '5801 Rickenbacker Rd', 'Building 5', 'Commerce', 'CA', '90040', 'US', '323-555-0203', 'commerce@unified.local', false),
  ('00000000-0000-0000-0000-000000000000', 'Long Beach Port Warehouse', 'Unified Shipping', '2201 E Wardlow Rd', '', 'Long Beach', 'CA', '90807', 'US', '562-555-0204', 'long-beach@unified.local', false),
  ('00000000-0000-0000-0000-000000000000', 'Ontario Logistics Center', 'Unified Shipping', '4350 E Jurupa St', 'Suite A', 'Ontario', 'CA', '91761', 'US', '909-555-0205', 'ontario@unified.local', false)
ON CONFLICT DO NOTHING;

COMMIT;
