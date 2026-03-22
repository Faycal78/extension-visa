<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('passport_submissions', function (Blueprint $table) {
            $table->id();
            $table->string('source_url')->nullable();
            $table->string('source_label')->nullable();
            $table->string('title')->nullable();
            $table->string('surname')->nullable();
            $table->string('given_names')->nullable();
            $table->string('full_name')->nullable();
            $table->string('passport_number')->nullable()->index();
            $table->string('nationality')->nullable();
            $table->string('issuing_country')->nullable();
            $table->date('birth_date')->nullable();
            $table->date('expiry_date')->nullable();
            $table->string('sex', 8)->nullable();
            $table->string('status')->default('received');
            $table->longText('raw_text')->nullable();
            $table->json('extracted_data')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('passport_submissions');
    }
};
