-- Separate database for integration tests (DATABASE_URL_TEST), so tests never touch dev data.
CREATE DATABASE reconcile_test OWNER reconcile;
