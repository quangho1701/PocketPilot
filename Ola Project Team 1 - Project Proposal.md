**PocketPilot**  
AI Personal Budgeting Guide (Memory Track)

**Problem Statement**

**Background**

Managing personal finances remains a challenge for many individuals, particularly students and young professionals who must balance daily spending with long-term financial goals. While numerous budgeting applications such as Mint, YNAB, and Monarch Money provide tools for tracking expenses and monitoring budgets, most existing solutions are primarily reactive. They summarize spending after transactions have already occurred rather than helping users make informed financial decisions before spending.

In addition, many budgeting applications treat each interaction independently. Although they store transaction history, they often fail to build a persistent understanding of users' evolving financial habits, priorities, and decision-making patterns. As a result, users must repeatedly configure budgets, goals, and spending preferences instead of benefiting from a financial assistant that continuously learns and adapts over time.

**Problem**

Current budgeting applications lack personalized, proactive financial guidance. They are unable to:

* Learn long-term spending behaviors and preferences across multiple sessions.  
* Provide personalized recommendations before purchases are made.  
* Adapt financial advice as users' goals and lifestyles evolve.  
* Remember previous spending decisions and incorporate them into future budgeting strategies.

**Project Description**

PocketPilot is a persistent AI-powered financial coach that goes beyond expense tracking by providing proactive, personalized spending guidance. It remembers users' financial goals, spending habits, recurring expenses, and past decisions across sessions to deliver recommendations before purchases are made. By continuously learning from user behavior and adapting to changing circumstances, PocketPilot helps users make smarter financial decisions while building sustainable spending habits over time. 

| Traditional Budgeting Apps | PocketPilot |
| :---: | :---: |

| Explain where your money went after you've spent it. | Helps you decide before you spend. |
| :---- | :---- |

| Static budgets that require manual updates. | Learns and adapts as your habits evolve. |
| :---- | :---- |

| Transaction history. | Persistent memory of goals, habits, and past decisions. |
| :---- | :---- |

| Reports spending. | Coaches spending. |
| :---- | :---- |

***Traditional Budgeting***: “You spend $100 last month on entertainment, $30 more than your stated goal.”

***PocketPilot:*** “Buying this boba would exceed your weekly discretionary budget and conflict with your goal of reducing sugary drinks. How about a homemade latte or matcha today instead?”

**Target Users**

* College and university students managing limited budgets.  
* Young professionals seeking to improve financial discipline.  
* Individuals beginning their personal finance journey.  
* Users who struggle with impulse spending and want proactive financial guidance.  
* Anyone looking for a more personalized alternative to traditional budgeting applications.

**Must-Have Features**

### **1\. Persistent Financial Memory**

* Stores recurring income and expenses.  
* Provides a visual dashboard with expense breakdowns, spending trends, and savings progress   
* Remembers financial goals and savings targets.  
* Allows users to **add, edit, and delete** (CRUD) transactions and financial goals  
* Learns long-term spending habits across sessions.  
* Maintains personalized user profiles.

### **2\. Personalized Budget Planning**

* Generates budgets based on income, goals, and historical spending.  
* Dynamically adjusts budgets as spending patterns change.  
* Tracks progress toward savings goals.

### **3\. Real-Time Spending Assistant**

* Conversational AI chat interface for purchase decisions.  
* Provides recommendations such as:  
  * Buy  
  * Wait  
  * Skip  
* Explains reasoning based on available budget, upcoming expenses, and user priorities.

### **4\. Adaptive Learning**

* Learns changing financial behaviors over time.  
* Updates recommendations based on previous user decisions.  
* Adjusts future spending predictions without requiring manual reconfiguration.

### **5\. Automatic Expense Categorization**

* Extracts transactions from uploaded receipts or connected bank records.  
* Extracts transactions from:  
  * manually completed forms  
  * uploaded receipts  
  * connected bank records  
  * scanned products or receipts (computer vision)  
* Automatically classifies expenses into categories such as food, transportation, entertainment, and utilities.

**Good-to-Have Features**

- **Cash Flow Forecasting:** predicts future account balances based on recurring income, expenses, and spending trends, helping anticipate cash shortages  
- **Price Tracking & Smart Purchase Timing:** monitors price trends for selected products and recommends whether users should buy now or wait for a better deal  
- **Goal Simulation:** allows users to explore the financial impact of different spending decisions (e.g., “If I skip eating out twice a week, when can I reach my $2,000 travel goal?”)  
- **Weekly AI Insights:** generates personalized spending reflections, behavioral patterns, and actionable recommendations  
- **Overspending Alerts**

**Suggested Tech Stack**

*Frontend* \- React, Next,js  
*Backend* \- Python (FastAPI) or [Node.js](http://Node.js) (Express)  
*Database* \- PostgreSQL  
*Authentication* \- \_\_\_\_\_\_\_\_\_\_\_\_\_  
*AI/LLM* \- Qwen Cloud  
*Persistent Memory:*  ChromaDB  
*Deployment* \- Docker, Kubernetes, AWS/Azure

**IMPLEMENTATION PLAN**  
**DURATION: 1 MONTH (DEADLINE: )**  
**START DATE: JULY 16th**

**Suggest Hackathon:**  
**Link Figma for UI/UX:**  
**Link ER Diagram:**  
**Weekly Meeting:** 

**Github Repo: link**

**Link Docs Attached for Week 1:**

- Hoàng Anh:   
- Hà:  
- Ngữ:  
- Quang: 

**Feature Assign:**

- **Persistent Financial Memory** \+ Adaptive Learning Engine: Quang  
- **Real-Time Spending Assistant** \+ Weekly AI Insights & Alerts: Ngữ  
- **Personalized Budget Planning** \+ Goal Simulation: Hà  
- **OCR Expense Categorization** \+ Transaction Management & Dashboard UI: Hoàng Anh

**\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_\_**

**FIRST WEEK (JULY 19 \- JULY 26): Understand the investment domain, finalize requirements, and prepare the technical foundation.** 

1. **Financial Domain Research**   
   Each team member researches the financial concepts related to the features they will implement.   
2. **Feature Research**   
* Existing applications  
* User workflows  
* Similar UI/UX  
* Best practices  
* Technical challenges  
3. **API Research**  
   Evaluate available APIs (including external APIs)  
4. **System Design**   
* API endpoint list  
* User flow diagrams  
5. **UI/UX Design (use Figma or any tools to design or use existing design from other apps)**  
   Create/Draft approximately 50% of the application screens.   
6. **Development Setup**   
   Set up:  
* GitHub repository  
* Branch strategy  
* CI/CD (optional)  
* Project board (GitHub Projects/Jira/Trello)  
* Database  
* Backend framework  
* Frontend framework

**Tabs:**

1. **Homepage: Introduce web**  
2. **Market Dashboard**  
3. **Chart**  
4. **Learning**  
5. **Community** 

