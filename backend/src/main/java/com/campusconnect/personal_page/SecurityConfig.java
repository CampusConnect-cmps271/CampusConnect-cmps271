package com.campusconnect.personal_page;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.io.IOException;
import java.util.Arrays;
import java.util.Collections;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    // This is our "secret token". In real life, this would be a Cognito/Keycloak JWT.
    private static final String MOCK_TOKEN = "campus-connect-secret";

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
            // 1. Enable CORS using our custom configuration below
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            
            // 2. Disable CSRF for APIs (safe because we use tokens, not cookies)
            .csrf(csrf -> csrf.disable())
            
            // 3. Set authorization rules
            .authorizeHttpRequests(auth -> auth
                // Allow static files (HTML, CSS, JS, icons) without a token
                .requestMatchers("/profile.html", "/", "/index.html", "/*.css", "/*.js", "/*.ico").permitAll()
                // EVERYTHING else requires authentication
                .anyRequest().authenticated()
            )
            
            // 4. Set session management (stateless - we don't store sessions)
            .sessionManagement(session -> session
                .sessionCreationPolicy(SessionCreationPolicy.STATELESS)
            )
            
            // 5. Add our custom token filter before the standard username/password filter
            .addFilterBefore(new MockTokenFilter(), UsernamePasswordAuthenticationFilter.class);
        
        return http.build();
    }

    // This bean tells Spring Security exactly what CORS requests to allow
    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration configuration = new CorsConfiguration();
        // Allow requests from any origin (for development - lock this down in production)
        configuration.setAllowedOrigins(Arrays.asList("*"));
        // Allow all standard HTTP methods
        configuration.setAllowedMethods(Arrays.asList("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        // Allow all headers (this is crucial for the Authorization header)
        configuration.setAllowedHeaders(Arrays.asList("*"));
        
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        // Apply this configuration to ALL endpoints
        source.registerCorsConfiguration("/**", configuration);
        return source;
    }

    // This is the custom filter that checks for our mock token
    public static class MockTokenFilter extends OncePerRequestFilter {
        @Override
        protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
                throws ServletException, IOException {
            
            String authHeader = request.getHeader("Authorization");

            // Check if the header exists and matches our mock token
            if (authHeader != null && authHeader.equals("Bearer " + MOCK_TOKEN)) {
                // If valid, tell Spring Security this request is authenticated
                UsernamePasswordAuthenticationToken authentication = 
                    new UsernamePasswordAuthenticationToken("student1", null, Collections.emptyList());
                SecurityContextHolder.getContext().setAuthentication(authentication);
            }
            
            // Continue with the request (either authenticated or not)
            filterChain.doFilter(request, response);
        }
    }
}