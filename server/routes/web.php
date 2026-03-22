<?php

use App\Http\Controllers\PassportSubmissionController;
use Illuminate\Support\Facades\Route;

Route::get('/', [PassportSubmissionController::class, 'index'])->name('dashboard');
