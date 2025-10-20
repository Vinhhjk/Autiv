import dotenv from "dotenv";

dotenv.config();
const DATABASE_URL_HTTPS = process.env.DATABASE_URL_HTTPS;
console.log(DATABASE_URL_HTTPS);
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
        ...defaultOptions.headers,
        ...options.headers,
      },
    };
  
    try {
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Xata API Error: ${response.status} ${response.statusText} - ${errorText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error(`Error making request to ${url}:`, error.message);
      throw error;
    }
  }

async function main(){
    const apiKey = process.env.XATA_API_KEY;
    const targetApiKey = 'ak_0c24bdde0efe977c828f631ad6e7aa86';
    const response = await xataRequest('tables/developers/query', {
        method: 'POST',
        body: JSON.stringify({
            columns:[
                'api_key'
            ],
            filter:{
                api_key: targetApiKey
            },
            page:{
                size:1
            }
            
        })
    }, apiKey);
    if(response.records.length > 0){
        console.log('API key exists in the database.');
    }else{
        console.log('API key does not exist in the database.');
    }
}
main()