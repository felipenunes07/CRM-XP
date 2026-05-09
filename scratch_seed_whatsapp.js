
const { pool } = require('./apps/api/dist/db/client.js');

async function seed() {
  const query = `
    INSERT INTO whatsapp_instances (
      instance_name, 
      display_label, 
      evolution_base_url, 
      evolution_api_key, 
      is_default
    ) VALUES ($1, $2, $3, $4, $5) 
    ON CONFLICT (instance_name) DO NOTHING
  `;
  
  try {
    await pool.query(query, [
      'exportelas', 
      'WhatsApp Principal', 
      'https://exportelas-evolution.f0dgeg.easypanel.host', 
      'SUA_CHAVE_ANTIGA_DA_EVOLUTION_API', 
      true
    ]);
    console.log('Instância WhatsApp cadastrada com sucesso');
  } catch (err) {
    console.error('Erro ao cadastrar instância:', err);
  } finally {
    await pool.end();
  }
}

seed();
