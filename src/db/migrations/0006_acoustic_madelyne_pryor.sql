DROP INDEX "expenses_group_created_idx";--> statement-breakpoint
CREATE INDEX "group_id_idx" ON "groups" USING btree ("id");--> statement-breakpoint
CREATE INDEX "transaction_group_idx" ON "transactions" USING btree ("group_id","type");