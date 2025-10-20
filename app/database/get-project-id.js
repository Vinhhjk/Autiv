/**
 * Simple script to get the Demo Project ID after migration
 * Run this after running the migration to get the actual project_id
 */

const { Client } = require('pg');
require('dotenv').config();

async function getProjectId() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Get the Demo Project 1 ID
    const result = await client.query(`
      SELECT xata_id, name 
      FROM projects 
      WHERE name = 'Demo Project 1'
      LIMIT 1;
    `);

    if (result.rows.length > 0) {
      const projectId = result.rows[0].xata_id;
      console.log('\n🎯 Demo Project ID found:');
      console.log(`Project Name: ${result.rows[0].name}`);
      console.log(`Project ID: ${projectId}`);
      console.log('\n📝 Add this to your .env file:');
      console.log(`VITE_DEMO_PROJECT_ID=${projectId}`);
      console.log('\n✅ Done! Use this project_id in your frontend.');
    } else {
      console.log('❌ Demo Project 1 not found. Run the migration first.');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

getProjectId();
