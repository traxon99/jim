CREATE TYPE "public"."routine_icon_color" AS ENUM('red', 'orange', 'amber', 'green', 'teal', 'blue', 'indigo', 'pink');--> statement-breakpoint
CREATE TYPE "public"."routine_icon_shape" AS ENUM('square', 'triangle', 'squircle');--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "icon_shape" "routine_icon_shape" DEFAULT 'square' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "icon_color" "routine_icon_color" DEFAULT 'red' NOT NULL;