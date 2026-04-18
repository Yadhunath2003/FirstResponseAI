let unitType = "";
let unitNumber = "";
let myUnitId = localStorage.getItem("frai_unit_id") || "";
let myCallsign = localStorage.getItem("frai_callsign") || "";
let deviceId = localStorage.getItem("frai_device_id");

if (!deviceId) {
    deviceId = "dev_" + Math.random().toString(36).substring(2, 10);
    localStorage.setItem("frai_device_id", deviceId);
}

document.addEventListener("DOMContentLoaded", () => {
    // If we already have a unit registered in local storage, we can skip directly to incident selection
    if (myUnitId && myCallsign) {
        showScreen("screen-incidents");
        document.getElementById("reg-callsign-display").innerText = myCallsign;
        loadIncidents();
        return;
    }

    // Reg flow
    const typeButtons = document.querySelectorAll("#reg-type-select button");
    typeButtons.forEach(btn => {
        btn.addEventListener("click", () => {
            unitType = btn.getAttribute("data-type");
            if (unitType === "command" || unitType === "staging") {
                // Number not required for Command or Staging
                registerUnit(unitType, "");
            } else {
                document.getElementById("reg-type-select").classList.add("hidden");
                document.getElementById("reg-number-select").classList.remove("hidden");
                document.getElementById("unit-number-input").focus();
            }
        });
    });

    document.getElementById("reg-back-btn").addEventListener("click", () => {
        document.getElementById("reg-type-select").classList.remove("hidden");
        document.getElementById("reg-number-select").classList.add("hidden");
    });

    document.getElementById("reg-confirm-btn").addEventListener("click", () => {
        unitNumber = document.getElementById("unit-number-input").value.trim();
        if (!unitNumber) {
            alert("Please enter a unit number.");
            return;
        }
        registerUnit(unitType, unitNumber);
    });
});

async function registerUnit(type, number) {
    try {
        const res = await fetch("/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                unit_type: type,
                unit_number: number,
                device_id: deviceId
            })
        });
        const data = await res.json();
        myUnitId = data.unit_id;
        myCallsign = data.callsign;
        
        localStorage.setItem("frai_unit_id", myUnitId);
        localStorage.setItem("frai_callsign", myCallsign);
        
        document.getElementById("reg-callsign-display").innerText = myCallsign;
        showScreen("screen-incidents");
        loadIncidents();
    } catch (err) {
        console.error("Registration failed", err);
        alert("Server error during registration.");
    }
}

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(screenId).classList.remove("hidden");
    document.getElementById(screenId).classList.add("active");
}
