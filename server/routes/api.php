<?php

use App\Http\Controllers\PassportSubmissionController;
use Illuminate\Support\Facades\Route;

Route::post('/passport-submissions', [PassportSubmissionController::class, 'store']);
