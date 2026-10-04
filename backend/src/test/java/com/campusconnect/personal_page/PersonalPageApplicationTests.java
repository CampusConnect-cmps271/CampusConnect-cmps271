package com.campusconnect.personal_page;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.DEFINED_PORT)
class PersonalPageApplicationTests {

    private final HttpClient client = HttpClient.newHttpClient();

    // Test 1: Request WITHOUT a token should be rejected (401 or 403)
    @Test
    void shouldReturnUnauthorizedWhenNoTokenProvided() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:8080/api/profiles"))
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        // We expect a 401 or 403 (any 4xx error)
        assertTrue(response.statusCode() >= 400 && response.statusCode() < 500,
                "Expected a 4xx error but got: " + response.statusCode());
        System.out.println("Test 1 passed! Status: " + response.statusCode());
    }

    // Test 2: Request WITH a valid token should succeed (200 OK)
    @Test
    void shouldReturnOkWhenValidTokenProvided() throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://localhost:8080/api/profiles"))
                .header("Authorization", "Bearer campus-connect-secret")
                .GET()
                .build();

        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());

        assertEquals(200, response.statusCode(), "Expected 200 OK but got: " + response.statusCode());
        System.out.println("Test 2 passed! Status: " + response.statusCode());
    }
}