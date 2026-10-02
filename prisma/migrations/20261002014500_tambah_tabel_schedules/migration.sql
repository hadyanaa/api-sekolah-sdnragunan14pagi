-- CreateTable
CREATE TABLE "schedules" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "days" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "audio_file" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);
