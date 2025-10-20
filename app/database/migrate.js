import pg from "pg";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

const SUBSCRIPTION_MANAGER_ADDRESS = '0xd8840e4A14fDd6833F213919ebF5727ee9E2E4dB';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function createTables() {
  const client = await pool.connect();
  try {
    console.log("Starting database migration...\n");

    // Create developers table FIRST (other tables reference it)
    console.log("Creating 'developers' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS developers (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        wallet_address TEXT UNIQUE NOT NULL,
        smart_account_address TEXT UNIQUE,
        display_name TEXT,
        email TEXT,
        company_name TEXT,
        website_url TEXT,
        logo_url TEXT,
        description TEXT,
        is_verified BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT TRUE,
        total_subscribers INTEGER DEFAULT 0,
        total_revenue DECIMAL(20, 8) DEFAULT 0
      );
    `);
    console.log("'developers' table created\n");

    // Create supported_tokens table
    console.log("Creating 'supported_tokens' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS supported_tokens (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        name TEXT NOT NULL,
        symbol TEXT NOT NULL,
        token_address TEXT NOT NULL UNIQUE
      );
    `);
    console.log("'supported_tokens' table created\n");

    // Create projects table (must be created before subscription_plans)
    console.log("Creating 'projects' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        supported_token_id TEXT NOT NULL REFERENCES supported_tokens(xata_id) ON DELETE RESTRICT,
        name TEXT NOT NULL,
        description TEXT,
        subscription_manager_address TEXT UNIQUE,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("'projects' table created\n");

    // Create users table
    console.log("Creating 'users' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        wallet_address TEXT UNIQUE NOT NULL,
        smart_account_address TEXT UNIQUE,
        email TEXT
      );
    `);
    console.log("'users' table created\n");

    // Create subscription_plans table (references developers and projects)
    console.log("Creating 'subscription_plans' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS subscription_plans (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(xata_id) ON DELETE CASCADE,
        contract_plan_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        price DECIMAL(20, 8) NOT NULL,
        token_address TEXT NOT NULL,
        token_symbol TEXT DEFAULT 'USDC',
        period_seconds INTEGER NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        current_subscribers INTEGER DEFAULT 0
      );
    `);
    console.log("'subscription_plans' table created\n");

    // Create user_subscriptions table (references developers and subscription_plans)
    console.log("Creating 'user_subscriptions' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_subscriptions (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        user_id TEXT NOT NULL REFERENCES users(xata_id) ON DELETE CASCADE,
        plan_id TEXT NOT NULL REFERENCES subscription_plans(xata_id) ON DELETE CASCADE,
        developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'cancelled')),
        start_date BIGINT NOT NULL,
        next_payment_date BIGINT,
        last_payment_date BIGINT,
        cancelled_at BIGINT,
        cancellation_effective_at BIGINT,
        subscription_manager_address TEXT
      );
    `);
    console.log("'user_subscriptions' table created\n");

    // Create payments table (references user_subscriptions and developers)
    console.log("Creating 'payments' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        subscription_id TEXT NOT NULL REFERENCES user_subscriptions(xata_id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(xata_id) ON DELETE CASCADE,
        developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        amount DECIMAL(20, 8) NOT NULL,
        token_address TEXT NOT NULL,
        token_symbol TEXT DEFAULT 'USDC',
        payment_date BIGINT NOT NULL,
        tx_hash TEXT UNIQUE NOT NULL
      );
    `);
    console.log("'payments' table created\n");


    // Create api_keys table
    console.log("Creating 'api_keys' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        key_value TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("'api_keys' table created\n");

    // Create project_delegations table
    console.log("Creating 'project_delegations' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS project_delegations (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        project_id TEXT NOT NULL REFERENCES projects(xata_id) ON DELETE CASCADE,
        delegated_to_developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        delegated_by_developer_id TEXT NOT NULL REFERENCES developers(xata_id) ON DELETE CASCADE,
        permissions TEXT NOT NULL CHECK (permissions IN ('read', 'write', 'admin')),
        is_active BOOLEAN DEFAULT TRUE
      );
    `);
    console.log("'project_delegations' table created\n");

    // Create user_delegations table
    console.log("Creating 'user_delegations' table...");
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_delegations (
        xata_id TEXT PRIMARY KEY DEFAULT ('rec_' || substr(md5(random()::text), 1, 20)),
        xata_version BIGINT DEFAULT 0,
        xata_createdat TIMESTAMPTZ DEFAULT NOW(),
        xata_updatedat TIMESTAMPTZ DEFAULT NOW(),

        user_wallet_address TEXT NOT NULL,
        user_smart_account TEXT NOT NULL,
        subscription_manager_address TEXT NOT NULL,
        delegation_data TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at BIGINT NOT NULL,
        cancelled_at BIGINT,

        -- Ensure one delegation per user per subscription manager
        UNIQUE(user_smart_account, subscription_manager_address)
      );
    `);
    console.log("'user_delegations' table created\n");

    // Create indexes for better query performance
    console.log("Creating indexes...");

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_developers_wallet ON developers(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_developers_smart_account ON developers(smart_account_address);

      CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_users_smart_account ON users(smart_account_address);

      CREATE INDEX IF NOT EXISTS idx_plans_developer ON subscription_plans(developer_id);
      CREATE INDEX IF NOT EXISTS idx_plans_project ON subscription_plans(project_id);
      CREATE INDEX IF NOT EXISTS idx_plans_active ON subscription_plans(is_active);

      CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON user_subscriptions(plan_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_developer ON user_subscriptions(developer_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_user_dev ON user_subscriptions(user_id, developer_id);

      CREATE INDEX IF NOT EXISTS idx_payments_subscription ON payments(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
      CREATE INDEX IF NOT EXISTS idx_payments_developer ON payments(developer_id);
      CREATE INDEX IF NOT EXISTS idx_payments_tx_hash ON payments(tx_hash);
      CREATE INDEX IF NOT EXISTS idx_payments_created ON payments(xata_createdat);

      CREATE INDEX IF NOT EXISTS idx_projects_developer ON projects(developer_id);
      CREATE INDEX IF NOT EXISTS idx_projects_supported_token ON projects(supported_token_id);
      CREATE INDEX IF NOT EXISTS idx_projects_active ON projects(is_active);
      CREATE INDEX IF NOT EXISTS idx_projects_subscription_manager ON projects(subscription_manager_address);

      CREATE INDEX IF NOT EXISTS idx_supported_tokens_symbol ON supported_tokens(symbol);
      CREATE INDEX IF NOT EXISTS idx_api_keys_developer ON api_keys(developer_id);
      CREATE INDEX IF NOT EXISTS idx_api_keys_value ON api_keys(key_value);
      CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);

      CREATE INDEX IF NOT EXISTS idx_delegations_project ON project_delegations(project_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_to_dev ON project_delegations(delegated_to_developer_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_by_dev ON project_delegations(delegated_by_developer_id);
      CREATE INDEX IF NOT EXISTS idx_delegations_active ON project_delegations(is_active);
      CREATE INDEX IF NOT EXISTS idx_delegations_project_dev ON project_delegations(project_id, delegated_to_developer_id);

      CREATE INDEX IF NOT EXISTS idx_user_delegations_wallet ON user_delegations(user_wallet_address);
      CREATE INDEX IF NOT EXISTS idx_user_delegations_smart_account ON user_delegations(user_smart_account);
      CREATE INDEX IF NOT EXISTS idx_user_delegations_subscription_manager ON user_delegations(subscription_manager_address);
      CREATE INDEX IF NOT EXISTS idx_user_delegations_active ON user_delegations(is_active);
      CREATE INDEX IF NOT EXISTS idx_user_delegations_user_manager ON user_delegations(user_smart_account, subscription_manager_address);
    `);
    console.log("Indexes created\n");

    console.log("Migration completed successfully!");

  } catch (error) {
    console.error("Migration failed:", error);
  } finally {
    client.release();
  }
}

async function seedSampleData() {
  const client = await pool.connect();

  try {
    console.log("\nSeeding sample data...\n");

    // Insert a sample developer
    const developerResult = await client.query(`
      INSERT INTO developers (
        wallet_address,
        smart_account_address,
        display_name,
        email,
        company_name,
        description,
        is_verified
      ) VALUES (
        '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0',
        '0x1234567890123456789012345678901234567890',
        'Demo Developer',
        'demo@autiv.dev',
        'Autiv Demo',
        'Sample developer account for testing',
        true
      )
      ON CONFLICT (wallet_address) DO NOTHING
      RETURNING xata_id;
    `);

    let developerId;
    if (developerResult.rows.length > 0) {
      developerId = developerResult.rows[0].xata_id;
      console.log(`Sample developer created with ID: ${developerId}`);
    } else {
      const res = await client.query(`SELECT xata_id from developers where wallet_address = '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0'`);
      if(res.rows.length > 0) {
        developerId = res.rows[0].xata_id;
      }
    }

    // Insert a sample user
    const userResult = await client.query(`
      INSERT INTO users (
        wallet_address,
        smart_account_address,
        email
      ) VALUES (
        '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B',
        '0x0987654321098765432109876543210987654321',
        'sample.user@email.com'
      )
      ON CONFLICT (wallet_address) DO NOTHING
      RETURNING xata_id;
    `);

    let userId;
    if (userResult.rows.length > 0) {
      userId = userResult.rows[0].xata_id;
      console.log(`Sample user created with ID: ${userId}`);
    } else {
      const res = await client.query(`SELECT xata_id from users where wallet_address = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B'`);
      if(res.rows.length > 0) {
        userId = res.rows[0].xata_id;
      }
    }

    if (developerId) {

      // Insert supported tokens used by sample projects
      const supportedTokenResult = await client.query(`
        INSERT INTO supported_tokens (
          name,
          symbol,
          token_address
        ) VALUES
        ($1, $2, $3)
        ON CONFLICT (token_address) DO UPDATE
        SET name = EXCLUDED.name,
            symbol = EXCLUDED.symbol
        RETURNING xata_id;
      `, ['USD Coin', 'USDC', '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B']);

      let supportedTokenId = supportedTokenResult.rows.length > 0 ? supportedTokenResult.rows[0].xata_id : null;
      if (!supportedTokenId) {
        const res = await client.query(`SELECT xata_id FROM supported_tokens WHERE token_address = $1 LIMIT 1;`, ['0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B']);
        if (res.rows.length > 0) {
          supportedTokenId = res.rows[0].xata_id;
        }
      }

      if (!supportedTokenId) {
        throw new Error('Failed to insert or retrieve supported token for sample data');
      }

      // Insert sample projects FIRST (before subscription plans)
      const projectResult = await client.query(`
        INSERT INTO projects (
          developer_id,
          supported_token_id,
          name,
          description,
          subscription_manager_address
        ) VALUES
        (
          $1,
          $2,
          'Demo Project 1',
          'First demo project for testing',
          $3
        ),
        (
          $1,
          $2,
          'Demo Project 2', 
          'Second demo project for testing',
          NULL
        )
        ON CONFLICT DO NOTHING
        RETURNING xata_id, name;
      `, [developerId, supportedTokenId, SUBSCRIPTION_MANAGER_ADDRESS]);

      console.log("Sample projects created\n");

      // Insert sample subscription plans (linked to projects)
      if (projectResult.rows.length > 0) {
        const firstProjectId = projectResult.rows[0].xata_id;
        const secondProjectId = projectResult.rows.length > 1 ? projectResult.rows[1].xata_id : firstProjectId;

        await client.query(`
          INSERT INTO subscription_plans (
            developer_id,
            project_id,
            contract_plan_id,
            name,
            price,
            token_address,
            period_seconds
          ) VALUES
          (
            $1,
            $2,
            1,
            '1 Minute Test',
            1.0,
            '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B',
            60
          ),
          (
            $1,
            $2,
            2,
            '2 Minutes Test',
            2.0,
            '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B',
            120
          ),
          (
            $1,
            $2,
            3,
            '5 Minutes Test',
            5.0,
            '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B',
            300
          ),
          (
            $1,
            $3,
            1,
            'Starter Pack',
            3.0,
            '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B',
            600
          ),
          (
            $1,
            $3,
            2,
            'Pro Pack',
            6.0,
            '0x861FFB58f5Bc14723FdD2D18F422fa2627b95F8B',
            1200
          )
          ON CONFLICT DO NOTHING;
        `, [developerId, firstProjectId, secondProjectId]);

        console.log("Sample subscription plans created (linked to projects)\n");
      }

      // Insert sample API keys for the developer (not tied to specific projects)
      await client.query(`
        INSERT INTO api_keys (
          developer_id,
          key_value,
          name,
          description
        ) VALUES
        (
          $1,
          'ak_' || substr(md5(random()::text), 1, 32),
          'Primary API Key',
          'Main API key for all projects'
        ),
        (
          $1,
          'ak_' || substr(md5(random()::text), 1, 32),
          'Secondary API Key',
          'Backup API key for all projects'
        ),
        (
          $1,
          'autiv_test_dev_key',
          'Test API Key',
          'Test API key for development'
        )
        ON CONFLICT DO NOTHING;
      `, [developerId]);

      console.log("Sample API keys created\n");

      // Create a second developer for delegation example
      const secondDevResult = await client.query(`
        INSERT INTO developers (
          wallet_address,
          smart_account_address,
          display_name,
          email,
          company_name,
          description,
          is_verified
        ) VALUES (
          '0x9876543210987654321098765432109876543210',
          '0x5555555555555555555555555555555555555555',
          'Delegated Developer',
          'delegated@autiv.dev',
          'Autiv Delegate',
          'Developer with delegated access',
          false
        )
        ON CONFLICT (wallet_address) DO NOTHING
        RETURNING xata_id;
      `);

      let secondDevId;
      if (secondDevResult.rows.length > 0) {
        secondDevId = secondDevResult.rows[0].xata_id;
        console.log(`Second developer created with ID: ${secondDevId}`);
      } else {
        const res = await client.query(`SELECT xata_id from developers where wallet_address = '0x9876543210987654321098765432109876543210'`);
        if(res.rows.length > 0) {
          secondDevId = res.rows[0].xata_id;
        }
      }

      // Create delegation: main dev delegates project access to second dev
      if (projectResult.rows.length > 0 && secondDevId) {
        const firstProject = projectResult.rows[0];
        await client.query(`
          INSERT INTO project_delegations (
            project_id,
            delegated_to_developer_id,
            delegated_by_developer_id,
            permissions
          ) VALUES (
            $1,
            $2,
            $3,
            'write'
          )
          ON CONFLICT DO NOTHING;
        `, [firstProject.xata_id, secondDevId, developerId]);

        console.log("Sample delegation created\n");
      }

      // Get a plan to subscribe the user to
      const planResult = await client.query(`
        SELECT xata_id FROM subscription_plans WHERE developer_id = $1 AND name = '1 Minute Test' LIMIT 1;
      `, [developerId]);

      if (planResult.rows.length > 0 && userId) {
        const planId = planResult.rows[0].xata_id;
        console.log(`Subscribing sample user to plan ID: ${planId}`);

        const now = Math.floor(Date.now() / 1000);
        // Insert a sample user subscription
        await client.query(`
          INSERT INTO user_subscriptions (
            user_id,
            plan_id,
            developer_id,
            status,
            start_date,
            last_payment_date,
            next_payment_date
          ) VALUES (
            $1,
            $2,
            $3,
            'active',
            $4::bigint,
            $4::bigint,
            $4::bigint + 86400
          )
          ON CONFLICT DO NOTHING;
        `, [userId, planId, developerId, now]);

        console.log("Sample user subscription created\n");
      }

    } else {
      console.log("Sample developer or user not created, skipping plan/subscription seeding.\n");
    }

    console.log("Seeding completed!");

  } catch (error) {
    console.error("Seeding failed:", error);
    throw error;
  } finally {
    client.release();
  }
}

async function main() {
  try {
    await createTables();

    // Ask if user wants to seed sample data
    const shouldSeed = process.argv.includes('--seed');
    if (shouldSeed) {
      await seedSampleData();
    } else {
      console.log("Tip: Run with --seed flag to add sample data");
    }

  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
