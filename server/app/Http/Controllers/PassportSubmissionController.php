<?php

namespace App\Http\Controllers;

use App\Models\PassportSubmission;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PassportSubmissionController extends Controller
{
    public function index(): View
    {
        return view('dashboard', [
            'submissions' => PassportSubmission::query()
                ->latest()
                ->limit(50)
                ->get(),
        ]);
    }

    public function store(Request $request)
    {
        $payload = $request->validate([
            'source_url' => ['nullable', 'string', 'max:2048'],
            'source_label' => ['nullable', 'string', 'max:255'],
            'raw_text' => ['nullable', 'string'],
            'extracted_data' => ['required', 'array'],
            'extracted_data.title' => ['nullable', 'string', 'max:255'],
            'extracted_data.surname' => ['nullable', 'string', 'max:255'],
            'extracted_data.givenNames' => ['nullable', 'string', 'max:255'],
            'extracted_data.fullName' => ['nullable', 'string', 'max:255'],
            'extracted_data.passportNumber' => ['nullable', 'string', 'max:255'],
            'extracted_data.nationality' => ['nullable', 'string', 'max:255'],
            'extracted_data.issuingCountry' => ['nullable', 'string', 'max:255'],
            'extracted_data.birthDate' => ['nullable', 'date'],
            'extracted_data.expiryDate' => ['nullable', 'date'],
            'extracted_data.sex' => ['nullable', 'string', 'max:8'],
        ]);

        $data = $payload['extracted_data'];

        $submission = PassportSubmission::create([
            'source_url' => $payload['source_url'] ?? null,
            'source_label' => $payload['source_label'] ?? null,
            'title' => $data['title'] ?? null,
            'surname' => $data['surname'] ?? null,
            'given_names' => $data['givenNames'] ?? null,
            'full_name' => $data['fullName'] ?? null,
            'passport_number' => $data['passportNumber'] ?? null,
            'nationality' => $data['nationality'] ?? null,
            'issuing_country' => $data['issuingCountry'] ?? null,
            'birth_date' => $data['birthDate'] ?? null,
            'expiry_date' => $data['expiryDate'] ?? null,
            'sex' => $data['sex'] ?? null,
            'status' => 'received',
            'raw_text' => $payload['raw_text'] ?? null,
            'extracted_data' => $data,
        ]);

        return response()->json([
            'ok' => true,
            'id' => $submission->id,
            'dashboard_url' => route('dashboard'),
        ], 201);
    }
}
