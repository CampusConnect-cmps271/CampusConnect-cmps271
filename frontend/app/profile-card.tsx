"use client";

import { useState } from 'react';

type Profile = {
  id?: string;
  cognito_user_id: string;
  first_name: string;
  last_name: string;
  major: string;
  graduation_year: number | '';
  bio: string;
  elective_preferences: string;
};

export default function ProfileCard() {
  // MOCK DATA: We are using local state instead of Supabase
  const [profile, setProfile] = useState<Profile>({
    cognito_user_id: 'cognito-test-123',
    first_name: 'John',
    last_name: 'Doe',
    major: 'Computer Science',
    graduation_year: 2027,
    bio: 'I am testing my new API!',
    elective_preferences: 'AI, Web Development',
  });

  const [isEditing, setIsEditing] = useState(false);
  const [loading] = useState(false); // No loading needed for mock

  // Save the profile (Mocked)
  function saveProfile() {
    if (!profile.first_name.trim() || !profile.last_name.trim()) {
      alert('First Name and Last Name cannot be empty!');
      return;
    }
    if (
      profile.graduation_year === '' ||
      String(profile.graduation_year).length !== 4
    ) {
      alert('Please enter a valid 4-digit Graduation Year.');
      return;
    }

    // Simulate a database save
    setIsEditing(false);
    alert('Profile saved successfully! (Mocked)');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100">
        <p className="text-gray-500">Loading profile...</p>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100 p-4">
      <div className="bg-white rounded-lg shadow-md p-8 w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-gray-800 border-b-2 border-gray-200 pb-4 mb-6">
          Student Profile
        </h1>

        <div className="space-y-4">
          <Field label="First Name" isEditing={isEditing}>
            <p className="bg-gray-50 p-3 rounded-md text-gray-800">{profile.first_name || 'N/A'}</p>
            <input type="text" className="w-full p-3 border border-gray-300 rounded-md"
              value={profile.first_name} onChange={(e) => setProfile({ ...profile, first_name: e.target.value })} />
          </Field>

          <Field label="Last Name" isEditing={isEditing}>
            <p className="bg-gray-50 p-3 rounded-md text-gray-800">{profile.last_name || 'N/A'}</p>
            <input type="text" className="w-full p-3 border border-gray-300 rounded-md"
              value={profile.last_name} onChange={(e) => setProfile({ ...profile, last_name: e.target.value })} />
          </Field>

          <Field label="Major" isEditing={isEditing}>
            <p className="bg-gray-50 p-3 rounded-md text-gray-800">{profile.major || 'N/A'}</p>
            <input type="text" className="w-full p-3 border border-gray-300 rounded-md"
              value={profile.major} onChange={(e) => setProfile({ ...profile, major: e.target.value })} />
          </Field>

          <Field label="Graduation Year" isEditing={isEditing}>
            <p className="bg-gray-50 p-3 rounded-md text-gray-800">{profile.graduation_year || 'N/A'}</p>
            <input type="number" className="w-full p-3 border border-gray-300 rounded-md"
              value={profile.graduation_year} onChange={(e) => setProfile({ ...profile, graduation_year: e.target.value === '' ? '' : Number(e.target.value) })} />
          </Field>

          <Field label="Bio" isEditing={isEditing}>
            <p className="bg-gray-50 p-3 rounded-md text-gray-800">{profile.bio || 'N/A'}</p>
            <input type="text" className="w-full p-3 border border-gray-300 rounded-md"
              value={profile.bio} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} />
          </Field>
        </div>

        <div className="flex gap-3 mt-6">
          {!isEditing ? (
            <button onClick={() => setIsEditing(true)} className="flex-1 bg-blue-600 text-white py-3 rounded-md font-bold hover:bg-blue-700">
              Edit Profile
            </button>
          ) : (
            <>
              <button onClick={() => setIsEditing(false)} className="flex-1 bg-gray-400 text-white py-3 rounded-md font-bold hover:bg-gray-500">
                Cancel
              </button>
              <button onClick={saveProfile} className="flex-1 bg-green-600 text-white py-3 rounded-md font-bold hover:bg-green-700">
                Save Changes
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, isEditing, children }: { label: string; isEditing: boolean; children: [React.ReactNode, React.ReactNode]; }) {
  const [display, input] = children;
  return (
    <div>
      <label className="block text-sm font-bold text-gray-600 mb-1">{label}</label>
      {isEditing ? input : display}
    </div>
  );
}
