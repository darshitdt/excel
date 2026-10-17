const BASE_URL = "https://eversense.forbesmarshall.com";

// List of public CORS proxies to try sequentially
const PROXIES = [
  "https://corsproxy.io/?",
  "https://api.allorigins.win/raw?url=",
  "https://thingproxy.freeboard.io/fetch/"
];

// On page load, populate saved credentials if available
window.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem("bw_api_user");
  const savedPass = localStorage.getItem("bw_api_pass");

  if (savedUser && savedPass) {
    document.getElementById("apiUser").value = savedUser;
    document.getElementById("apiPass").value = savedPass;
    document.getElementById("rememberMe").checked = true;
  }
});

/**
 * Displays status message on screen
 */
function showStatus(msg) {
  let statusDiv = document.getElementById("statusMsg");
  if (!statusDiv) {
    statusDiv = document.createElement("p");
    statusDiv.id = "statusMsg";
    statusDiv.style.fontWeight = "bold";
    statusDiv.style.color = "#107c41";
    document.querySelector(".card").insertBefore(statusDiv, document.getElementById("excelTable"));
  }
  statusDiv.innerText = msg;
}

/**
 * Clears saved login info from browser storage and resets fields
 */
function clearCredentials() {
  localStorage.removeItem("bw_api_user");
  localStorage.removeItem("bw_api_pass");
  document.getElementById("apiUser").value = "";
  document.getElementById("apiPass").value = "";
  document.getElementById("rememberMe").checked = false;
  showStatus("Saved credentials cleared!");
}

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

/**
 * Renders parsed JSON data into the HTML Table
 */
function renderMainPageTable(jsonData) {
  const tableBody = document.getElementById("tableBody");
  tableBody.innerHTML = "";

  let sumHTotal = 0, sumDTotal = 0, sumFlow = 0, sumTotalizer = 0;
  const devices = jsonData.data || [];

  devices.forEach(device => {
    const latest = device.latest || {};
    const entityFields = latest.ENTITY_FIELD || {};
    const timeSeries = latest.TIME_SERIES || {};

    const siteName = entityFields.name ? entityFields.name.value : "";
    const location = entityFields.label ? entityFields.label.value : "";

    let hTotal = timeSeries["Hourly Total"] ? parseFloat(timeSeries["Hourly Total"].value) : NaN;
    if (isNaN(hTotal) && timeSeries["Hourly Flow"]) {
      hTotal = parseFloat(timeSeries["Hourly Flow"].value);
    }

    const dTotal = timeSeries["Daily Total"] ? parseFloat(timeSeries["Daily Total"].value) : 0;
    
    let nocYear = timeSeries["NOC Limit (m3/year)"] ? parseFloat(timeSeries["NOC Limit (m3/year)"].value) : 0;
    nocYear = nocYear > 0 ? nocYear : 2927300;

    let nocDay = timeSeries["NOC Limit (m3/day)"] ? parseFloat(timeSeries["NOC Limit (m3/day)"].value) : 0;
    nocDay = nocDay > 0 ? nocDay : 8020;

    let flowVal = timeSeries["Flow"] ? parseFloat(timeSeries["Flow"].value) : NaN;
    if (isNaN(flowVal) && timeSeries["Flow Rate"]) {
      flowVal = parseFloat(timeSeries["Flow Rate"].value);
    }

    const totalizerVal = timeSeries["Totalizer"] ? parseFloat(timeSeries["Totalizer"].value) : 0;

    if (siteName || location) {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${siteName}</td>
        <td>${location}</td>
        <td>${formatNumber(hTotal)}</td>
        <td>${formatNumber(dTotal)}</td>
        <td>${formatNumber(nocYear)}</td>
        <td>${formatNumber(nocDay)}</td>
        <td>${formatNumber(flowVal)}</td>
        <td>${formatNumber(totalizerVal)}</td>
      `;
      tableBody.appendChild(row);

      if (!isNaN(hTotal)) sumHTotal += hTotal;
      if (!isNaN(dTotal)) sumDTotal += dTotal;
      if (!isNaN(flowVal)) sumFlow += flowVal;
      if (!isNaN(totalizerVal)) sumTotalizer += totalizerVal;
    }
  });

  // Summary Row
  const totalRow = document.createElement("tr");
  totalRow.style.fontWeight = "bold";
  totalRow.style.backgroundColor = "#e2eaf3";
  totalRow.innerHTML = `
    <td>Total:</td>
    <td>-</td>
    <td>${formatNumber(sumHTotal)}</td>
    <td>${formatNumber(sumDTotal)}</td>
    <td>-</td>
    <td>-</td>
    <td>${formatNumber(sumFlow)}</td>
    <td>${formatNumber(sumTotalizer)}</td>
  `;
  tableBody.appendChild(totalRow);
}

function formatNumber(num) {
  if (isNaN(num) || num === null || num === undefined) return "0.00";
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function exportToExcel() {
  const table = document.getElementById("excelTable");
  const wb = XLSX.utils.table_to_book(table, { sheet: "Borewell Main Page" });
  XLSX.writeFile(wb, "Borewell_Main_Page_Report.xlsx");
}
