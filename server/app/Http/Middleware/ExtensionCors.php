<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class ExtensionCors
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->isMethod('OPTIONS') && $request->is('api/*')) {
            return response('', 204)
                ->withHeaders($this->headers($request));
        }

        /** @var Response $response */
        $response = $next($request);

        if ($request->is('api/*')) {
            foreach ($this->headers($request) as $name => $value) {
                $response->headers->set($name, $value);
            }
        }

        return $response;
    }

    private function headers(Request $request): array
    {
        $origin = $request->headers->get('Origin', '*');

        return [
            'Access-Control-Allow-Origin' => $origin,
            'Vary' => 'Origin',
            'Access-Control-Allow-Credentials' => 'false',
            'Access-Control-Allow-Methods' => 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers' => 'Content-Type, Accept, X-Requested-With',
        ];
    }
}
