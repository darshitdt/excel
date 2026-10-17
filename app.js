const BASE_URL = "https://eversense.forbesmarshall.com";

// List of public CORS proxies to try sequentially
const PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/"
];

/**
 * Helper function to send POST/GET requests across proxies
 */
async function fetchWithProxy(endpoint, options = {}) {
  const targetUrl = BASE_URL + endpoint;
  let lastError = null;

  for (const proxy of PROXIES) {
    try {
      const fullUrl = proxy + encodeURIComponent(targetUrl);
      const response = await fetch(fullUrl, options);
      
      if (response.status === 403) {
        console.warn(`Proxy ${proxy} returned 403, trying next proxy...`);
        continue;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Server status ${response.status}: ${errorText}`);
      }

      return await response.json();
    } catch (err) {
      console.error(`Failed with proxy ${proxy}:`, err.message);
      lastError = err;
    }
  }

  throw new Error(lastError ? lastError.message : "All proxy connections failed.");
}

/**
 * Main execution function
 */
async function runMacroLogic() {
  const userInput = document.getElementById("apiUser").value.trim();
  const passInput = document.getElementById("apiPass").value.trim();
  const rememberMe = document.getElementById("rememberMe").checked;

  if (!userInput || !passInput) {
    alert("Please enter both Username and Password.");
    return;
  }

  if (rememberMe) {
    localStorage.setItem("bw_api_user", userInput);
    localStorage.setItem("bw_api_pass", passInput);
  } else {
    localStorage.removeItem("bw_api_user");
    localStorage.removeItem("bw_api_pass");
  }

  try {
    showStatus("Authenticating with Forbes Marshall Server...");

    // 1. Login
    const loginData = await fetchWithProxy("/api/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ username: userInput, password: passInput })
    });

    const token = loginData.token;
    if (!token) throw new Error("Auth token missing from server response.");

    showStatus("Fetching latest telemetry data...");

    // 2. Telemetry Query
    const dataPayload = {
      entityFields: [
        { type: "ENTITY_FIELD", key: "name" },
        { type: "ENTITY_FIELD", key: "label" }
      ],
      latestValues: [
        { type: "TIME_SERIES", key: "Hourly Total" },
        { type: "TIME_SERIES", key: "Hourly Flow" },
        { type: "TIME_SERIES", key: "Daily Total" },
        { type: "TIME_SERIES", key: "NOC Limit (m3/year)" },
        { type: "TIME_SERIES", key: "NOC Limit (m3/day)" },
        { type: "TIME_SERIES", key: "Flow" },
        { type: "TIME_SERIES", key: "Flow Rate" },
        { type: "TIME_SERIES", key: "Totalizer" }
      ],
      entityFilter: { type: "entityType", entityType: "DEVICE" },
      pageLink: { pageSize: 100, page: 0 }
    };

    const responseData = await fetchWithProxy("/api/entitiesQuery/find", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "X-Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(dataPayload)
    });

    renderMainPageTable(responseData);
    showStatus("All Borewell data successfully updated!");
  } catch (err) {
    console.error(err);
    alert("Execution Error: " + err.message);
    showStatus("Error loading data. Check console (F12) for details.");
  }
}
