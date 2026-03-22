<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class PassportSubmission extends Model
{
    protected $fillable = [
        'source_url',
        'source_label',
        'title',
        'surname',
        'given_names',
        'full_name',
        'passport_number',
        'nationality',
        'issuing_country',
        'birth_date',
        'expiry_date',
        'sex',
        'status',
        'raw_text',
        'extracted_data',
    ];

    protected $casts = [
        'birth_date' => 'date',
        'expiry_date' => 'date',
        'extracted_data' => 'array',
    ];
}
