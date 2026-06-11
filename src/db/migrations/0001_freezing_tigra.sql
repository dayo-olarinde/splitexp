ALTER TABLE "transactions" ALTER COLUMN "type" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "status" SET DEFAULT 'confirmed';--> statement-breakpoint
ALTER TABLE "transactions" ALTER COLUMN "description" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "total_amount" integer;--> statement-breakpoint
ALTER TABLE "transactions" ADD COLUMN "payer_id" text;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_payer_id_user_id_fk" FOREIGN KEY ("payer_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" DROP COLUMN "updated_at";