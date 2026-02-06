
import { User } from "../types";

const ENABLE_MOCK_LOGIN = true; 

const isProductionBuild = () => {
    try {
        // @ts-ignore
        return import.meta.env.PROD === true;
    } catch (e) {
        return false;
    }
};

export const IS_DEV_MODE = isProductionBuild() ? false : ENABLE_MOCK_LOGIN;

export const DEV_LATENCY = 800;

export const DEV_CREDENTIALS = {
    username: 'admin',
    password: '123'
};

export const MOCK_USER_DATA: User = {
    username: 'admin', 
    credits: 9999,
    avatarUrl: 'https://ui-avatars.com/api/?name=Admin&background=103742&color=e2b36e',
    role: 'admin',
    status: 'active',
    team: 'EK'
};
