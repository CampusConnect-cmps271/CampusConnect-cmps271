package com.campusconnect.personal_page.repository;

import com.campusconnect.personal_page.model.StudentProfile;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface StudentProfileRepository extends JpaRepository<StudentProfile, Long> {
    // Spring Data JPA automatically provides methods like save(), findAll(), findById(), deleteById()
}