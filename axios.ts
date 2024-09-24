// Generate a default axios instance and export it

import axios from 'axios';
import useGlobalStore from '@/zustand/global';
import { BareFetcher, SWRConfiguration } from 'swr';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";
let ongoingRefreshTokenRequest = false;

async function handleUnauthorized (response: any, originalRequest: any) {

    if (response.status === 401 && !originalRequest._retry) {
        console.log('Unauthorized...');

        originalRequest._retry = true;
        const refreshToken = useGlobalStore.getState().refreshToken;
        if (refreshToken) {
            if (ongoingRefreshTokenRequest) {
                console.log(`Another refresh token request is ongoing, waiting for it to finish...`);
                while (ongoingRefreshTokenRequest) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
                console.log(`Another refresh token request has finished, retrying original request...`);
                return axios(originalRequest.responseURL);
            }
            try {
                ongoingRefreshTokenRequest = true;

                console.log(`refresh_token found, try to refresh token`);
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
                console.log(`Status: ${response.status}`);
                console.log(`Data: ${JSON.stringify(response.data)}`);
                if (response.status === 200) {
                    console.log(`Access token refreshed`);
                    useGlobalStore.setState({ accessToken: response.data.access_token });
                    useGlobalStore.setState({ tokenValidated: true });
                    if (response.data.refresh_token) {
                        console.log(`Refresh token refreshed`);
                        useGlobalStore.setState({ refreshToken: response.data.refresh_token });
                    }
                    return axios(originalRequest.responseURL);
                }
                else {
                    console.log(`Failed to refresh token`);
                    useGlobalStore.setState({ accessToken: null });
                    useGlobalStore.setState({ refreshToken: null });
                    useGlobalStore.setState({ tokenValidated: false });
                }
            } catch (e) {
                console.warn(e);
            }
            finally {
                ongoingRefreshTokenRequest = false;
            }
        }
        else {
            console.log(`No refresh token found - Logging out`);
            useGlobalStore.setState({ accessToken: null });
            useGlobalStore.setState({ refreshToken: null });
            useGlobalStore.setState({ tokenValidated: false });
        }
    }
}

const instance = axios.create({
    baseURL: baseURL,
    headers: {
        'Content-Type': 'application/json',
    },
    validateStatus: (status) => {
        return status >= 200 && status < 500;
    }
});

console.log('Set request interceptor for axios instance');
instance.interceptors.request.use(
    (config) => {
        const accessToken = useGlobalStore.getState().accessToken;
        if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
        }
        return config;
    }
);

console.log('Set response interceptor for axios instance');
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
export { Fetcher };