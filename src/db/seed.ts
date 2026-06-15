import { faker } from "@faker-js/faker";
import crypto from "crypto";
import { pg } from "../config/db";
import { toKobo } from "../utils/calculations";

interface SeedUser {
  id: string;
  name: string;
  email: string;
}

const BASE_URL = "http://localhost:7000";
const createUser = async (name: string, email: string): Promise<SeedUser> => {
  const res = await fetch(`${BASE_URL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: BASE_URL,
    },
    body: JSON.stringify({ name, email, password: "Password123!" }),
  });

  const data = await res.json();
  if (!res.ok)
    throw new Error(`Failed to create user ${email}: ${JSON.stringify(data)}`);

  return { id: data.user.id, name, email };
};

async function seed() {
  console.log("⏳ Starting database hardening seed...");

  try {
    console.log("🧹 Cleaning out old records...");
    await pg`TRUNCATE TABLE ledger_entries, transactions, group_members, groups, "user" RESTART IDENTITY CASCADE`;

    // 2. Generate 10 Users
    console.log("👤 Seeding 10 users...");
    const users: SeedUser[] = [];
    for (let i = 0; i < 6; i++) {
      const name = faker.person.fullName();
      const email = faker.internet
        .email({ firstName: name.split(" ")[0] })
        .toLowerCase();
      users.push(await createUser(name, email));
      console.log(`  created ${name} (${email})`);
    }

    // 3. Generate 4 Groups
    console.log("🏢 Seeding 4 groups...");
    const groupTemplates = [
      {
        name: "Apartment Crew",
        desc: "Monthly rent and shared utilities tracker",
      },
      {
        name: "Weekend Trip to Lagos",
        desc: "Transport, feeding, and beach house splits",
      },
      {
        name: "Football Turf Club",
        desc: "Weekly pitch rental and water expenses",
      },
      {
        name: "Project Collaborators",
        desc: "Shared SaaS tool subscriptions and lunch",
      },
    ];
    const groups = [];

    for (let i = 0; i < groupTemplates.length; i++) {
      const template = groupTemplates[i]!;
      // Assign an admin creator (rotate through our users array)
      const creator = users[i % users.length]!;

      const [group] = await pg`
        INSERT INTO groups (id, name, description, created_by)
        VALUES (${crypto.randomUUID()}, ${template.name}, ${template.desc}, ${creator.id})
        RETURNING id, name
      `;
      groups.push(group);
    }

    // 4. Establish Group Memberships
    console.log("👥 Linking group memberships...");
    for (const group of groups) {
      // Add every user to every group so we have high concurrency capability later
      for (let j = 0; j < users.length; j++) {
        const user = users[j]!;
        const role = j < 2 ? "admin" : "member";
        await pg`
          INSERT INTO group_members (group_id, user_id, role)
          VALUES (${group?.id}, ${user.id}, ${role})
        `;
      }
    }

    // 5. Generate 40 Simulated Expenses
    console.log("💸 Flooding ledger with 40 expenses...");
    const categories = [
      "Food",
      "Transport",
      "Rent",
      "Utilities",
      "Entertainment",
    ];
    const descriptions = [
      "KFC Group Dinner",
      "Uber rides to venue",
      "Electricity token",
      "Pitch booking deposit",
      "Groceries run",
      "Netflix Subscription",
    ];

    for (let i = 0; i < 40; i++) {
      const group = groups[i % groups.length]!;
      const payer = users[i % users.length]!;
      const category = categories[i % categories.length]!;
      const descText = `${descriptions[i % descriptions.length]!} #${i + 1}`;

      // Random expense amount between ₦2,500 and ₦45,000
      const amountDecimal = (Math.random() * (45000 - 2500) + 2500).toFixed(2);
      const amountKobo = toKobo(amountDecimal);

      await pg.begin(async (tx) => {
        const [txRow] = await tx`
          INSERT INTO transactions (id, group_id, type, split_type, status, payer_id, total_amount, description, category, created_at)
          VALUES (
            ${crypto.randomUUID()}, ${group.id}, 'expense', 'equal', 'confirmed', 
            ${payer.id}, ${amountKobo}, ${descText}, ${category}, 
            NOW() - (${40 - i} * INTERVAL '1 day')          )
          RETURNING id
        `;

        // Equal split logic calculation inside the script
        const shareKobo = Math.floor(amountKobo / users.length);
        const remainder = amountKobo - shareKobo * users.length;

        const ledgerRows = [
          {
            transaction_id: txRow!.id,
            group_id: group.id,
            user_id: payer.id,
            amount: amountKobo,
          },
          ...users.map((u, index) => ({
            transaction_id: txRow!.id,
            group_id: group.id,
            user_id: u.id,
            amount: -(shareKobo + (index === 0 ? remainder : 0)),
          })),
        ];

        await tx`INSERT INTO ledger_entries ${tx(ledgerRows, "transaction_id", "group_id", "user_id", "amount")}`;
      });
    }

    // 6. Generate a few Settlements (Some Pending, Some Confirmed)
    console.log("🤝 Generating settlement history...");
    for (let i = 0; i < 5; i++) {
      const group = groups[i % groups.length]!;
      const payer = users[i % users.length]!; // The debtor paying back cash
      const payee = users[(i + 1) % users.length]!; // The creditor receiving cash
      const status = i % 2 === 0 ? "confirmed" : "pending";
      const amountKobo = toKobo("5000.00");

      await pg.begin(async (tx) => {
        const [txRow] = await tx`
          INSERT INTO transactions (id, group_id, type, status, payer_id, payee_id, total_amount, description, created_at)
          VALUES (
            ${crypto.randomUUID()}, ${group.id}, 'settlement', ${status}, 
            ${payer.id}, ${payee.id}, ${amountKobo}, 'Debt Settlement Payment', NOW()
          )
          RETURNING id
        `;

        const ledgerRows = [
          {
            transaction_id: txRow!.id,
            group_id: group.id,
            user_id: payer.id,
            amount: amountKobo,
          },
          {
            transaction_id: txRow!.id,
            group_id: group.id,
            user_id: payee.id,
            amount: -amountKobo,
          },
        ];

        await tx`INSERT INTO ledger_entries ${tx(ledgerRows, "transaction_id", "group_id", "user_id", "amount")}`;
      });
    }

    console.log(
      "✨ Database successfully hardened and populated! Go play around!",
    );
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed dramatically:", error);
    process.exit(1);
  }
}

seed();
