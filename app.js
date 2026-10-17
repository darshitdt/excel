const BASE_URL = "https://eversense.forbesmarshall.com";

// On page load, auto-fill saved credentials if available
window.addEventListener("DOMContentLoaded", () => {
  const savedUser = localStorage.getItem("bw_api_user");
  const savedPass = localStorage.getItem("bw_api_pass");

  if (savedUser && savedPass) {
    document.getElementById("apiUser").value = savedUser;
    document.getElementById("apiPass").value = savedPass;
    document.getElementById("rememberMe").checked = true;
  }
});

function showStatus(msg) {
  let statusDiv = document.getElementById("statusMsg");
  if (statusDiv) {
    statusDiv.innerText = msg;
  }
}

function clearCredentials() {
  localStorage.removeItem("bw_api_user");
  localStorage.removeItem("bw_api_pass");
  document.getElementById("apiUser").value = "";
  document.getElementById("apiPass").value = "";
  document.getElementById("rememberMe").checked = false;
  showStatus("Saved credentials cleared!");
}

/**
 * Executes login via standard HTML Form submission targeted at the hidden iframe
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

  showStatus("Authenticating via HTML Form submission...");

  // 1. Remove any old dynamic form if present
  const oldForm = document.getElementById("loginDynamicForm");
  if (oldForm) oldForm.remove();

  // 2. Create a temporary HTML form targeting the hidden iframe
  const form = document.createElement("form");
  form.id = "loginDynamicForm";
  form.method = "POST";
  form.action = BASE_URL + "/api/auth/login";
  form.target = "responseFrame"; // Route response to hidden iframe
  form.style.display = "none";

  // 3. Add hidden payload field containing credentials
  const usernameInput = document.createElement("input");
  usernameInput.type = "hidden";
  usernameInput.name = "username";
  usernameInput.value = userInput;

  const passwordInput = document.createElement("input");
  passwordInput.type = "hidden";
  passwordInput.name = "password";
  passwordInput.value = passInput;

  form.appendChild(usernameInput);
  form.appendChild(passwordInput);
  document.body.appendChild(form);

  // 4. Attach listener to the iframe to read the token when the form posts
  const iframe = document.getElementById("responseFrame");
  
  const onIframeLoad = async () => {
    iframe.removeEventListener("load", onIframeLoad);
    
    try {
      showStatus("Form submitted! Extracting authentication response...");

      // Attempt to read the returned JSON from the frame body
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const responseText = iframeDoc.body.innerText || iframeDoc.body.textContent;

      if (!responseText) {
        throw new Error("Empty response received from Forbes Marshall server.");
      }

      const loginData = JSON.parse(responseText);
      const token = loginData.token;

      if (!token) {
        throw new Error("Invalid username or password.");
      }

      showStatus("Login successful! Fetching live telemetry data...");
      await fetchTelemetryData(token);

    } catch (err) {
      console.error(err);
      showStatus("Form Submit Error: " + err.message);
      alert("Authentication failed: " + err.message);
    } finally {
      form.remove();
    }
  };

  iframe.addEventListener("load", onIframeLoad);

  // 5. Submit the form
  form.submit();
}

/**
 * Fetches telemetry dataset using the acquired JWT Token
 */
async function fetchTelemetryData(token) {
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

  try {
    const response = await fetch(BASE_URL + "/api/entitiesQuery/find", {
      method: "POST",
      headers: {
        "Content-Type": "application/json;charset=UTF-8",
        "Accept": "application/json, text/plain, */*",
        "X-Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(dataPayload)
    });

    if (!response.ok) {
      throw new Error(`Telemetry query failed with status: ${response.status}`);
    }

    const responseData = await response.json();
    renderMainPageTable(responseData);
    showStatus("All Borewell data successfully updated!");
  } catch (err) {
    console.error(err);
    showStatus("Telemetry Fetch Error: " + err.message);
  }
}

/**
 * Renders telemetry JSON data into the HTML Table
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

  // Totals Summary Row
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
