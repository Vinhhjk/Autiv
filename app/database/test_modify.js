import dotenv from "dotenv";

dotenv.config();
const DATABASE_URL_HTTPS = process.env.DATABASE_URL_HTTPS;
// Helper function to make Xata API requests
async function xataRequest(endpoint, options = {}, apiKey) {
    const url = `${DATABASE_URL_HTTPS}/${endpoint}`;
    
    const defaultOptions = {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    };
  
    const requestOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...options.headers,
      },
    };
  
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Xata API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      // Handle 204 No Content responses (e.g., DELETE operations)
      if (response.status === 204) {
        return { success: true };
      }
      
      // Check if response has content before parsing JSON
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      }
      
      return { success: true };
    } catch (error) {
      console.error(`Error making request to ${url}:`, error.message);
      throw error;
    }
  }

async function main(){
    const apiKey = process.env.XATA_API_KEY;
    const targetDevKey = 'autiv_test_dev_key'
    
    // First, query to find the API key record in the api_keys table
    const queryResponse = await xataRequest('tables/api_keys/query', {
        method: 'POST',
        body: JSON.stringify({
            columns:[
                'id',
                'key_value',
                'name',
                'description',
                'developer_id.display_name',
                'developer_id.company_name'
            ],
            filter:{
                key_value: targetDevKey
            },
            page:{
                size:1
            }
        })
    }, apiKey);
    
    if(queryResponse.records.length > 0){
        const recordId = queryResponse.records[0].id;
        console.log(`Found API key record with ID: ${recordId}`);
        console.log(`API key value: ${queryResponse.records[0].key_value}`);
        console.log(`API key name: ${queryResponse.records[0].name}`);
        console.log(`Description: ${queryResponse.records[0].description || 'N/A'}`);
        console.log(`Developer: ${queryResponse.records[0].developer_id?.display_name || 'N/A'}`);
        console.log(`Company: ${queryResponse.records[0].developer_id?.company_name || 'N/A'}`);
        
        // Show all projects this API key can access (all projects owned by the developer)
        const projectsResponse = await xataRequest('tables/projects/query', {
            method: 'POST',
            body: JSON.stringify({
                columns: ['id', 'name', 'description'],
                filter: {
                    developer_id: queryResponse.records[0].developer_id.id
                }
            })
        }, apiKey);
        
        console.log(`\nThis API key can access ${projectsResponse.records.length} projects:`);
        projectsResponse.records.forEach((project, index) => {
            console.log(`  ${index + 1}. ${project.name} (${project.description || 'No description'})`);
        });
        
        // Option 1: Delete the entire API key record
        const deleteResponse = await xataRequest(`tables/api_keys/data/${recordId}`, {
            method: 'DELETE'
        }, apiKey);
        
        console.log('\nAPI key record deleted successfully:', deleteResponse);
        
        // Option 2: Or just deactivate it (uncomment this and comment the delete above)
        // const updateResponse = await xataRequest(`tables/api_keys/data/${recordId}`, {
        //     method: 'PATCH',
        //     body: JSON.stringify({
        //         is_active: false  // Deactivate instead of delete
        //     })
        // }, apiKey);
        // console.log('API key deactivated successfully:', updateResponse);
        
    }else{
        console.log('API key does not exist in the database. Nothing to delete.');
    }
}
main()