export const FIELD_PATTERNS = {
  firstName: [
    'firstname',
    'first_name',
    'first-name',
    'fname',
    'forename',
    'given-name',
    'givenname',
    'given_name',
  ],
  lastName: [
    'lastname',
    'last_name',
    'last-name',
    'lname',
    'surname',
    'family-name',
    'familyname',
    'family_name',
  ],
  email: [
    'email',
    'e-mail',
    'emailaddress',
    'email_address',
    'email-address',
    'mail',
    'user_email',
    'useremail',
  ],
  phone: [
    'phone',
    'phonenumber',
    'phone_number',
    'phone-number',
    'telephone',
    'tel',
    'mobile',
    'cell',
    'contact',
    'contact_number',
  ],
  address: [
    'address',
    'street',
    'streetaddress',
    'street_address',
    'street-address',
    'address1',
    'address_1',
    'address-1',
    'addr',
  ],
  city: ['city', 'town', 'locality', 'municipality'],
  state: [
    'state',
    'province',
    'region',
    'territory',
    'stateprovince',
    'state_province',
    'state-province',
  ],
  zip: [
    'zip',
    'zipcode',
    'zip_code',
    'zip-code',
    'postal',
    'postalcode',
    'postal_code',
    'postal-code',
    'postcode',
  ],
  linkedin: [
    'linkedin',
    'linkedin_url',
    'linkedinurl',
    'linkedin-url',
    'linkedin_profile',
    'linkedinprofile',
  ],
  website: [
    'website',
    'site',
    'homepage',
    'portfolio',
    'portfoliourl',
    'portfolio_url',
    'personal_website',
    'personalwebsite',
    'portfolio website',
  ],
  github: [
    'github',
    'github_url',
    'githuburl',
    'github-profile',
    'githubprofile',
    'github_profile',
  ],
  twitter: ['twitter', 'twitter_handle', 'twitterhandle', 'twitter-handle'],
  otherWebsite: [
    'otherwebsite',
    'other_website',
    'other-website',
    'additionalwebsite',
    'additional_website',
    'additional-website',
  ],
}

// // Helper function to match field names (bonus!)
// export function matchFieldPattern(fieldName: string, patterns) {
//   const cleanField = fieldName.toLowerCase().replace(/[\s_-]/g, '')

//   for (const pattern of patterns) {
//     const cleanPattern = pattern.replace(/[\s_-]/g, '')
//     if (cleanField === cleanPattern || cleanField.includes(cleanPattern)) {
//       return true
//     }
//   }
//   return false
// }
