// IndexedDB setup
let dbPromise = indexedDB.open("moneyManagerDB", 2);

dbPromise.onupgradeneeded = (event) => {
    const db = event.target.result;

    if (!db.objectStoreNames.contains("users")) {
        const userStore = db.createObjectStore("users", { keyPath: "username" });
    }

    if (!db.objectStoreNames.contains("dailyExpenses")) {
        const expenseStore = db.createObjectStore("dailyExpenses", { keyPath: "id", autoIncrement: true });
        expenseStore.createIndex("user", "user", { unique: false });
        expenseStore.createIndex("category", "category", { unique: false });
    }
};
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/serviceworker.js').then((registration) => {
            console.log('ServiceWorker registration successful with scope: ', registration.scope);
        }, (error) => {
            console.log('ServiceWorker registration failed: ', error);
        });
    });
}


// Global variable for current user
let currentUser = null;

// Handle Sign-Up
document.getElementById("signup-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = document.getElementById("new-username").value;
    const password = document.getElementById("new-password").value;

    const dbTransaction = dbPromise.result.transaction("users", "readwrite");
    const userStore = dbTransaction.objectStore("users");

    userStore.add({ username: username, password: password }).onsuccess = () => {
        alert("Account created successfully! Please login.");
        window.location.href = "index.html";
    };

    dbTransaction.onerror = () => {
        alert("Username already exists.");
    };
});

// Set currentUser on successful login
document.getElementById("login-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

    const dbTransaction = dbPromise.result.transaction("users", "readonly");
    const userStore = dbTransaction.objectStore("users");

    userStore.get(username).onsuccess = (event) => {
        const user = event.target.result;
        if (user && user.password === password) {
            currentUser = user;
            localStorage.setItem('currentUser', JSON.stringify(user)); // Save in localStorage
            window.location.href = "profile.html";
        } else {
            alert("Invalid username or password.");
        }
    };
});

// Load currentUser from localStorage in profile page
if (window.location.pathname.includes("profile.html")) {
    currentUser = JSON.parse(localStorage.getItem('currentUser'));
    document.getElementById("profile-username").innerText = currentUser?.username || "Guest";
}


document.getElementById("expense-form")?.addEventListener("submit", (event) => {
    event.preventDefault();

    const amount = document.getElementById("amount").value;
    const paymentMethod = document.getElementById("payment-method").value;
    const category = document.getElementById("category").value;
    const expenseDate = document.getElementById("expense-date").value || new Date().toLocaleDateString(); // Default to today if not selected

    const expense = {
        user: currentUser.username,
        amount: parseFloat(amount),
        paymentMethod: paymentMethod,
        category: category,
        date: expenseDate
    };

    const dbTransaction = dbPromise.result.transaction("dailyExpenses", "readwrite");
    const store = dbTransaction.objectStore("dailyExpenses");
    store.add(expense);

    dbTransaction.oncomplete = () => {
        alert("Expense added successfully!");
        generateReport();
    };
});


function generateWeeklyReport() {
    const dbTransaction = dbPromise.result.transaction("dailyExpenses", "readonly");
    const store = dbTransaction.objectStore("dailyExpenses");

    const categoryTotals = {};
    const now = new Date();
    const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));

    store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const expense = cursor.value;
            const expenseDate = new Date(expense.date);

            if (expenseDate >= oneWeekAgo) {
                if (!categoryTotals[expense.category]) {
                    categoryTotals[expense.category] = [];
                }
                categoryTotals[expense.category].push(expense.amount);
            }
            cursor.continue();
        } else {
            // Process Report
            let report = "Weekly Report:\n\n";
            for (const category in categoryTotals) {
                const amounts = categoryTotals[category];
                const maxSpent = Math.max(...amounts);
                const minSpent = Math.min(...amounts);
                report += `${category} - Max: ${maxSpent}, Min: ${minSpent}\n`;
            }
            alert(report);
        }
    };
}

document.getElementById('generate-weekly-report')?.addEventListener('click', generateWeeklyReport);


// Generate CSV for Weekly Expenses
document.getElementById('download-weekly-csv')?.addEventListener('click', () => {
    generateCSV('week');
});

// Generate CSV for Monthly Expenses
document.getElementById('download-monthly-csv')?.addEventListener('click', () => {
    generateCSV('month');
});

// Generate CSV function
function generateCSV(period) {
    const dbTransaction = dbPromise.result.transaction("dailyExpenses", "readonly");
    const store = dbTransaction.objectStore("dailyExpenses");
    const expenses = [];

    store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const expense = cursor.value;
            const expenseDate = new Date(expense.date);
            const now = new Date();

            let valid = false;
            if (period === 'week') {
                const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
                valid = expenseDate >= oneWeekAgo;
            } else if (period === 'month') {
                const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
                valid = expenseDate >= oneMonthAgo;
            }

            if (valid) {
                expenses.push(expense);
            }
            cursor.continue();
        } else {
            // Generate CSV
            let csvContent = "data:text/csv;charset=utf-8,Date,Amount,Payment Method,Category\n";
            expenses.forEach(exp => {
                csvContent += `${exp.date},${exp.amount},${exp.paymentMethod},${exp.category}\n`;
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `${period}-expenses.csv`);
            document.body.appendChild(link); // Required for FF

            link.click();
            document.body.removeChild(link);
        }
    };
}
document.getElementById("view-expenses-btn")?.addEventListener("click", () => {
    const period = document.getElementById("view-period").value;
    viewExpenses(period);
});

// View expenses based on the selected period (daily, weekly, monthly, yearly)
function viewExpenses(period) {
    const dbTransaction = dbPromise.result.transaction("dailyExpenses", "readonly");
    const store = dbTransaction.objectStore("dailyExpenses");
    const now = new Date();
    const expenses = [];

    store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const expense = cursor.value;
            const expenseDate = new Date(expense.date);

            let valid = false;
            if (period === "daily") {
                valid = isSameDay(expenseDate, now);
            } else if (period === "weekly") {
                const oneWeekAgo = new Date(now.setDate(now.getDate() - 7));
                valid = expenseDate >= oneWeekAgo;
            } else if (period === "monthly") {
                const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
                valid = expenseDate >= oneMonthAgo;
            } else if (period === "yearly") {
                const oneYearAgo = new Date(now.setFullYear(now.getFullYear() - 1));
                valid = expenseDate >= oneYearAgo;
            }

            if (valid) {
                expenses.push(expense);
            }
            cursor.continue();
        } else {
            populateExpensesTable(expenses);
        }
    };
}

// Helper function to compare if two dates are the same day
function isSameDay(date1, date2) {
    return date1.getFullYear() === date2.getFullYear() &&
           date1.getMonth() === date2.getMonth() &&
           date1.getDate() === date2.getDate();
}

// Populate the expenses table with the filtered data
function populateExpensesTable(expenses) {
    const tableBody = document.getElementById("expenses-table").getElementsByTagName("tbody")[0];
    tableBody.innerHTML = ""; // Clear existing rows

    expenses.forEach(exp => {
        const row = tableBody.insertRow();
        row.insertCell(0).innerText = exp.date;
        row.insertCell(1).innerText = exp.amount;
        row.insertCell(2).innerText = exp.paymentMethod;
        row.insertCell(3).innerText = exp.category;
    });
}
function generateMonthlyReport() {
    const dbTransaction = dbPromise.result.transaction("dailyExpenses", "readonly");
    const store = dbTransaction.objectStore("dailyExpenses");

    const categoryTotals = {};
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    let totalSpent = 0;

    store.openCursor().onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
            const expense = cursor.value;
            const expenseDate = new Date(expense.date);
            const expenseMonth = expenseDate.getMonth();
            const expenseYear = expenseDate.getFullYear();

            // Check if expense is from the current month and year
            if (expenseMonth === currentMonth && expenseYear === currentYear) {
                totalSpent += expense.amount;
                if (!categoryTotals[expense.category]) {
                    categoryTotals[expense.category] = 0;
                }
                categoryTotals[expense.category] += expense.amount;
            }
            cursor.continue();
        } else {
            // After gathering all expenses, create a report
            let report = `Monthly Report for ${now.toLocaleString('default', { month: 'long' })} ${currentYear}:\n\n`;
            report += `Total Money Spent: $${totalSpent.toFixed(2)}\n\n`;
            report += "Category-wise Spending:\n";

            for (const category in categoryTotals) {
                report += `${category}: $${categoryTotals[category].toFixed(2)}\n`;
            }

            // Insights for data analysis
            report += "\nData Analysis Points:\n";
            if (totalSpent > 0) {
                const maxCategory = Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] > categoryTotals[b] ? a : b);
                const minCategory = Object.keys(categoryTotals).reduce((a, b) => categoryTotals[a] < categoryTotals[b] ? a : b);
                report += `- Highest spending category: ${maxCategory} ($${categoryTotals[maxCategory].toFixed(2)})\n`;
                report += `- Lowest spending category: ${minCategory} ($${categoryTotals[minCategory].toFixed(2)})\n`;
            } else {
                report += "- No expenses recorded this month.\n";
            }

            alert(report);
            generateMonthlyCSV(categoryTotals, totalSpent);
        }
    };
}

// Generate CSV for Monthly Report
function generateMonthlyCSV(categoryTotals, totalSpent) {
    let csvContent = "data:text/csv;charset=utf-8,Category,Amount\n";
    for (const category in categoryTotals) {
        csvContent += `${category},${categoryTotals[category].toFixed(2)}\n`;
    }
    csvContent += `Total,${totalSpent.toFixed(2)}\n`;

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `monthly-report-${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); // Required for FF

    link.click();
    document.body.removeChild(link);
}

// Button to trigger monthly report generation
document.getElementById("generate-monthly-report")?.addEventListener("click", generateMonthlyReport);

// Handle Logout
document.getElementById("logout-btn")?.addEventListener("click", () => {
    window.location.href = "index.html";
});
