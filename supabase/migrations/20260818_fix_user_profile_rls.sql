-- ============================================================
-- Fix RLS policy for user_profile table
-- This ensures company data can be read by all authenticated users
-- ============================================================

-- Drop existing RLS policies (if any)
DROP POLICY IF EXISTS "Allow authenticated users to read user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow authenticated users to insert user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow authenticated users to update user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow authenticated users to delete user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow anon to read user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow anon to insert user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow anon to update user_profile" ON user_profile;
DROP POLICY IF EXISTS "Allow anon to delete user_profile" ON user_profile;
DROP POLICY IF EXISTS "Enable read access for all users" ON user_profile;
DROP POLICY IF EXISTS "Enable read access for anon" ON user_profile;

-- Enable RLS on user_profile table
ALTER TABLE user_profile ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow anyone (authenticated or not) to read all user profiles
-- This is needed because we need to display company list when creating drivers
CREATE POLICY "Allow anyone to read user_profile"
ON user_profile
FOR SELECT
USING (true);

-- Policy 2: Allow anyone to insert user profiles
CREATE POLICY "Allow anyone to insert user_profile"
ON user_profile
FOR INSERT
WITH CHECK (true);

-- Policy 3: Allow anyone to update user profiles
CREATE POLICY "Allow anyone to update user_profile"
ON user_profile
FOR UPDATE
USING (true)
WITH CHECK (true);

-- Policy 4: Allow anyone to delete user profiles
CREATE POLICY "Allow anyone to delete user_profile"
ON user_profile
FOR DELETE
USING (true);

-- ============================================================
-- Also fix RLS for delivery_orders table
-- Ensure delivery orders can be read by all users
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated users to read delivery_orders" ON delivery_orders;
DROP POLICY IF EXISTS "Allow authenticated users to insert delivery_orders" ON delivery_orders;
DROP POLICY IF EXISTS "Allow authenticated users to update delivery_orders" ON delivery_orders;
DROP POLICY IF EXISTS "Allow anyone to read delivery_orders" ON delivery_orders;

ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read delivery orders
CREATE POLICY "Allow anyone to read delivery_orders"
ON delivery_orders
FOR SELECT
USING (true);

-- Allow anyone to insert delivery orders
CREATE POLICY "Allow anyone to insert delivery_orders"
ON delivery_orders
FOR INSERT
WITH CHECK (true);

-- Allow anyone to update delivery orders
CREATE POLICY "Allow anyone to update delivery_orders"
ON delivery_orders
FOR UPDATE
USING (true)
WITH CHECK (true);

-- ============================================================
-- Also fix RLS for vehicles table
-- ============================================================

DROP POLICY IF EXISTS "Allow authenticated users to read vehicles" ON vehicles;
DROP POLICY IF EXISTS "Allow anyone to read vehicles" ON vehicles;

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anyone to read vehicles"
ON vehicles
FOR SELECT
USING (true);

CREATE POLICY "Allow anyone to insert vehicles"
ON vehicles
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow anyone to update vehicles"
ON vehicles
FOR UPDATE
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow anyone to delete vehicles"
ON vehicles
FOR DELETE
USING (true);

-- ============================================================
-- Verify the policies
-- ============================================================

-- Check existing policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename IN ('user_profile', 'delivery_orders', 'vehicles')
ORDER BY tablename, policyname;
