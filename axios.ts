// Generate a default axios instance and export it

import axios from 'axios';
import useGlobalStore from '@/zustand/global';
import { BareFetcher, SWRConfiguration } from 'swr';
import logger from '@/components/shared/Logger';

let ongoingRefreshTokenRequest = false;

function getApiUrl () {
    if (!import.meta.env.PROD && useGlobalStore.getState().debugMode) {
        return import.meta.env.VITE_API_BASE_URL_DEBUG;
    }
    else {
        return import.meta.env.VITE_API_BASE_URL;
    }
}

function getAccountManagerUrl () {
    if (!import.meta.env.PROD && useGlobalStore.getState().debugMode) {
        logger.info(`Using debug account manager domain: ${import.meta.env.VITE_ACCOUNT_MANAGER_DOMAIN_DEBUG}`);
        return import.meta.env.VITE_ACCOUNT_MANAGER_DOMAIN_DEBUG;
    }
    else {
        logger.info(`Using account manager domain: ${import.meta.env.VITE_ACCOUNT_MANAGER_DOMAIN}`);
        return import.meta.env.VITE_ACCOUNT_MANAGER_DOMAIN;
    }
}

async function handleUnauthorized (response: any, originalRequest: any) {

    if (response.status === 401 && !originalRequest._retry) {
        logger.error('Unauthorized...');

        originalRequest._retry = true;
        const refreshToken = useGlobalStore.getState().refreshToken;
        if (refreshToken) {
            if (ongoingRefreshTokenRequest) {
                logger.info(`Another refresh token request is ongoing, waiting for it to finish...`);
                while (ongoingRefreshTokenRequest) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                logger.info(`Another refresh token request has finished, retrying original request...`);
                return axios(originalRequest.responseURL);
            }
            try {
                ongoingRefreshTokenRequest = true;

                logger.info(`refresh_token found, try to refresh token`);
                const axiosInstance = axios.create({
                    validateStatus: (status) => {
                        return status >= 200 && status < 500;
                    }
                });
                const response = await axiosInstance.post(`${import.meta.env.VITE_ZITADEL_DOMAIN}/oauth/v2/token`,
                    {},
                    {
                        params: {
                            grant_type: 'refresh_token',
                            client_id: import.meta.env.VITE_ZITADEL_CLIENT_ID,
                            refresh_token: refreshToken,
                        },
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        validateStatus: (status) => {
                            return status >= 200 && status < 500;
                        }
                    });
                if (response.status === 200) {
                    logger.info(`Access token refreshed`);
                    useGlobalStore.setState({ accessToken: response.data.access_token });
                    useGlobalStore.setState({ tokenValidated: true });
                    if (response.data.refresh_token) {
                        logger.info(`Refresh token refreshed`);
                        useGlobalStore.setState({ refreshToken: response.data.refresh_token });
                    }
                    return axios(originalRequest.responseURL);
                }
                else {
                    logger.error(`Failed to refresh token`);
                    useGlobalStore.setState({ accessToken: null });
                    useGlobalStore.setState({ refreshToken: null });
                    useGlobalStore.setState({ tokenValidated: false });
                }
            } catch (e) {
                logger.error(`Failed to refresh token: ${e}`);
            }
            finally {
                ongoingRefreshTokenRequest = false;
            }
        }
        else {
            logger.error(`No refresh token found, clearing access token...`);
            useGlobalStore.setState({ accessToken: null });
            useGlobalStore.setState({ refreshToken: null });
            useGlobalStore.setState({ tokenValidated: false });
        }
    }
}

logger.info(`Create axios instance using domain: ${getApiUrl()}`);
const instance = axios.create({
    baseURL: getApiUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: (status) => {
        return status >= 200 && status < 500;
    }
});

logger.info('Set request interceptor for axios instance');
instance.interceptors.request.use(
    (config) => {
        const accessToken = useGlobalStore.getState().accessToken;
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    }
);

logger.info('Set response interceptor for axios instance');
instance.interceptors.response.use(
    async (response: any) => {
        const originalRequest = response.request;
        if (response.status === 401 && !originalRequest._retry) {
            await handleUnauthorized(response, originalRequest);
        }
        return response;
    },
    async (error: { config: any; response: { status: number; }; }) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            await handleUnauthorized(error.response, originalRequest);
        }
        return Promise.reject(error);
    },
);

logger.info(`Create axios instance for account manager using domain: ${getAccountManagerUrl()}`);
const instanceAccountManager = axios.create({
    baseURL: getAccountManagerUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: (status) => {
        return status >= 200 && status < 500;
    }
});

logger.info('Set request interceptor for account manager axios instance');
instanceAccountManager.interceptors.request.use(
    (config) => {
        const accessToken = useGlobalStore.getState().accessToken;
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    }
);

logger.info('Set response interceptor for account manager axios instance');
instanceAccountManager.interceptors.response.use(
    async (response: any) => {
        const originalRequest = response.request;
        if (response.status === 401 && !originalRequest._retry) {
            await handleUnauthorized(response, originalRequest);
        }
        return response;
    },
    async (error: { config: any; response: { status: number; }; }) => {
        const originalRequest = error.config;
        if (error.response && error.response.status === 401 && !originalRequest._retry) {
            await handleUnauthorized(error.response, originalRequest);
        }
        return Promise.reject(error);
    },
);

interface FetcherProps extends SWRConfiguration<any, any, BareFetcher<any>> {
    url: string;
    filter?: [
        string,
        string | number | boolean | null | undefined | string[] | number[] | boolean[] | null[] | undefined[]
    ]
    orderBy?: [
        string,
        'asc' | 'desc'
    ]
    limit?: number;
    offset?: number;
    additionalParams?: {
        [key: string]: string | number | boolean | null | undefined | string[] | number[] | boolean[] | null[] | undefined[]
    }
}
const Fetcher = async ({ url, filter, orderBy, limit, offset, additionalParams }: FetcherProps) => {
    let params = {};
    if (filter) {
        params = {
            ...params,
            filter: JSON.stringify(filter),
        };
    }
    if (orderBy) {
        params = {
            ...params,
            orderBy: JSON.stringify(orderBy),
        };
    }
    if (limit) {
        params = {
            ...params,
            limit,
        };
    }
    if (offset) {
        params = {
            ...params,
            offset,
        };
    }
    if (additionalParams) {
        params = {
            ...params,
            ...additionalParams,
        };
    }
    //console.log(`[Fetcher] Fetching ${instance.defaults.baseURL}${url} with params: ${JSON.stringify(params)}`);
    const res = await instance.get(url, { params });
    if (res.status === 200) {
        return res.data;
    }
    else {
        throw new Error(JSON.stringify({ status: res.status, statusText: res.statusText, data: res.data }));
    }
};

export default instance;
export { Fetcher, getApiUrl, getAccountManagerUrl, instanceAccountManager };