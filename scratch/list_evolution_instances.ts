async function test() {
  try {
    const response = await fetch("https://exportelas-evolution.f0dgeg.easypanel.host/instance/fetchInstances", {
      headers: {
        "apikey": "SUA_CHAVE_ANTIGA_DA_EVOLUTION_API"
      }
    });
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
