export interface Profile {
  id: number;
  name: string;
  main_title: string;
  avatar_url: string;
  hometown: string;
  birth_day: number | null;
  party_day: number | null;
  profession_level: string;
  politic_level: string;
  gender: number;
  ethnicity: string;
  intro: string;
  avatars: {
    [key: string]: string;
  };
}

export interface ApiResponse {
  data: Profile[];
  error_code: number;
  error_message: string;
  server_time: number;
}

export interface ServerData {
  profiles: Profile[];
  careers: Record<number, PoliticalCareer[]>;
  updatedAt: string;
}

export interface CustomList {
  id: string;
  name: string;
  profileIds: number[];
  userId: string;
  createdAt: string;
}

export interface PoliticalCareer {
  id: number;
  person_id: number;
  description: string;
  from: number | null;
  to: number | null;
  title: string | null;
}

export interface PoliticalCareerResponse {
  data: PoliticalCareer[];
  error_code: number;
  error_message: string;
  server_time: number;
}
