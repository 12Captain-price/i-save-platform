// Organisation-approved by the owner on 19 October 2026. No messaging channel or hours implied.
export const publicContact = {
  office: '5th floor, Office 511, Yolk House, Bulawayo, Zimbabwe',
  email: 'zpyfinfo@gmail.com',
  phones: [
    { label: 'Office landline', value: '+263 29 226 1341', href: 'tel:+263292261341' },
    { label: 'Director', value: '+263 78 552 1029', href: 'tel:+263785521029' },
    { label: 'Additional contact', value: '+263 78 663 9536', href: 'tel:+263786639536' },
  ],
} as const;

export const publicContactEntries = [
  { id: 'email', label: 'Email', value: publicContact.email, type: 'email', href: `mailto:${publicContact.email}`, order: 1 },
  ...publicContact.phones.map((phone, index) => ({ ...phone, id: `phone-${index}`, type: 'phone', order: index + 2 })),
  { id: 'office', label: 'Office', value: publicContact.office, type: 'address', href: undefined, order: 5 },
];
