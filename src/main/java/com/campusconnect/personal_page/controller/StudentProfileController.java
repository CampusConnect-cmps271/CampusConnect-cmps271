package com.campusconnect.personal_page.controller;

import com.campusconnect.personal_page.model.StudentProfile;
import com.campusconnect.personal_page.repository.StudentProfileRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/profiles")
@CrossOrigin(origins = "*") // Allows your future frontend to talk to this backend
public class StudentProfileController {

    @Autowired
    private StudentProfileRepository profileRepository;

    // 1. GET all profiles (Just for testing)
    @GetMapping
    public List<StudentProfile> getAllProfiles() {
        return profileRepository.findAll();
    }

    // 2. GET a specific profile by ID
    @GetMapping("/{id}")
    public ResponseEntity<StudentProfile> getProfileById(@PathVariable Long id) {
        return profileRepository.findById(id)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    // 3. CREATE a new profile
    @PostMapping
    public StudentProfile createProfile(@RequestBody StudentProfile profile) {
        return profileRepository.save(profile);
    }

    // 4. UPDATE an existing profile
    @PutMapping("/{id}")
    public ResponseEntity<StudentProfile> updateProfile(@PathVariable Long id, @RequestBody StudentProfile profileDetails) {
        return profileRepository.findById(id)
                .map(profile -> {
                    profile.setFirstName(profileDetails.getFirstName());
                    profile.setLastName(profileDetails.getLastName());
                    profile.setMajor(profileDetails.getMajor());
                    profile.setGraduationYear(profileDetails.getGraduationYear());
                    profile.setBio(profileDetails.getBio());
                    profile.setElectivePreferences(profileDetails.getElectivePreferences());
                    profile.setCognitoUserId(profileDetails.getCognitoUserId()); // <-- THIS IS THE LINE YOU WERE LOOKING FOR
                    StudentProfile updatedProfile = profileRepository.save(profile);
                    return ResponseEntity.ok(updatedProfile);
                })
                .orElse(ResponseEntity.notFound().build());
    }
}