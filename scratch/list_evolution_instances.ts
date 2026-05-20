async function test() {
  try {
    const response = await fetch("https://exportelas-evolution.f0dgeg.easypanel.host/instance/fetchInstances", {
      headers: {
        "apikey": process.env.EVOLUTION_API_KEY || ""
      }
    });
    const json = await response.json();
    console.log(JSON.stringify(json, null, 2));
  } catch (e) {
    console.error(e);
  }
}
test();
